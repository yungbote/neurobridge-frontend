import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { matchPath, useLocation, useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/shared/ui/dialog";
import { Textarea } from "@/shared/ui/textarea";
import { Button } from "@/shared/ui/button";
import { useToast } from "@/shared/ui/toast";
import { useSSEContext } from "@/app/providers/SSEProvider";
import { useUser } from "@/app/providers/UserProvider";
import { useI18n } from "@/app/providers/I18nProvider";
import { listPendingIntakeQuestions, sendChatMessage } from "@/shared/api/ChatService";
import type { ChatMessage, JsonInput } from "@/shared/types/models";

type JsonRecord = Record<string, unknown>;
type TFunc = ReturnType<typeof useI18n>["t"];

type WorkflowV1Action = {
  id: string;
  label: string;
  token: string;
  variant?: string;
};

type WorkflowV1 = {
  version: number;
  kind: string;
  step?: string;
  blocking?: boolean;
  actions: WorkflowV1Action[];
};

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseJsonRecord(value: unknown): JsonRecord | null {
  if (!value) return null;
  if (isRecord(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return isRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

function messageKindFromMetadata(metadata: unknown): string {
  const md = parseJsonRecord(metadata);
  const kind = md ? String(md.kind ?? "") : "";
  return kind.trim().toLowerCase();
}

function workflowFromMetadata(metadata: unknown): WorkflowV1 | null {
  const md = parseJsonRecord(metadata);
  if (!md) return null;
  const wfRaw = md.workflow_v1;
  if (!isRecord(wfRaw)) return null;
  const version = Number((wfRaw as { version?: unknown }).version ?? 0);
  if (version !== 1) return null;
  const kind = String((wfRaw as { kind?: unknown }).kind ?? "").trim();
  if (!kind) return null;

  const actionsRaw = (wfRaw as { actions?: unknown }).actions;
  if (!Array.isArray(actionsRaw)) return null;

  const actions: WorkflowV1Action[] = [];
  for (const a of actionsRaw) {
    if (!isRecord(a)) continue;
    const id = String((a as { id?: unknown }).id ?? "").trim();
    const label = String((a as { label?: unknown }).label ?? "").trim();
    const token = String((a as { token?: unknown }).token ?? "").trim();
    const variant = String((a as { variant?: unknown }).variant ?? "").trim();
    if (!id || !label || !token) continue;
    actions.push({ id, label, token, variant: variant || undefined });
  }
  if (actions.length === 0) return null;

  const step = String((wfRaw as { step?: unknown }).step ?? "").trim();
  const blockingValue = (wfRaw as { blocking?: unknown }).blocking;
  const blocking = typeof blockingValue === "boolean" ? blockingValue : undefined;

  return { version, kind, step: step || undefined, blocking, actions };
}

function toastActionClassForVariant(variant: string | undefined) {
  switch (String(variant || "").toLowerCase()) {
    case "primary":
      return "bg-foreground text-background border-foreground hover:bg-foreground/90";
    case "subtle":
      return "opacity-80";
    default:
      return undefined;
  }
}

function toastCopyForKind(kind: string, t: TFunc) {
  if (kind === "path_intake_review") {
    return {
      title: t("pathIntake.reviewToast.title"),
      description: t("pathIntake.reviewToast.description"),
      actionLabel: t("pathIntake.reviewToast.replyHere"),
    };
  }
  return {
    title: t("pathIntake.toast.title"),
    description: t("pathIntake.toast.description"),
    actionLabel: t("pathIntake.toast.answerHere"),
  };
}

function threadRouteFor(id: string) {
  return `/chat/threads/${id}`;
}

function isOnThread(pathname: string, threadId: string) {
  if (!pathname || !threadId) return false;
  const match = matchPath({ path: "/chat/threads/:id", end: false }, pathname);
  return Boolean(match?.params?.id && String(match.params.id) === String(threadId));
}

function generateIdempotencyKey() {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch (err) {
    void err;
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function IntakeNotifications() {
  const { t } = useI18n();
  const { messages, connected } = useSSEContext();
  const { user } = useUser();
  const toast = useToast();
  const location = useLocation();
  const navigate = useNavigate();

  const seenRef = useRef<Set<string>>(new Set());
  const pathnameRef = useRef(location.pathname);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogThreadId, setDialogThreadId] = useState<string>("");
  const [dialogSourceMessageId, setDialogSourceMessageId] = useState<string>("");
  const [dialogQuestions, setDialogQuestions] = useState<string>("");
  const [dialogWorkflowActions, setDialogWorkflowActions] = useState<WorkflowV1Action[]>([]);
  const [dialogToastId, setDialogToastId] = useState<string>("");
  const [answer, setAnswer] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const pendingFetchRef = useRef<{ inFlight: boolean; lastAt: number }>({ inFlight: false, lastAt: 0 });

  const normalizedQuestions = useMemo(() => String(dialogQuestions || "").trim(), [dialogQuestions]);
  const canSend = useMemo(() => !sending && Boolean(answer.trim()) && Boolean(dialogThreadId), [sending, answer, dialogThreadId]);

  const quickActions = useMemo(() => {
    const filtered = (dialogWorkflowActions || []).filter((a) => a && a.token && a.label);
    if (filtered.length <= 0) return [];
    return filtered;
  }, [dialogWorkflowActions]);

  useEffect(() => {
    pathnameRef.current = location.pathname;
  }, [location.pathname]);

  // Durable fallback: SSE has no replay and can burst multiple messages. If the user refreshes or misses the
  // realtime intake prompt, fetch the current pending intake questions.
  const fetchPending = useCallback(
    async (limit = 3) => {
      if (!user?.id) return;
      if (pendingFetchRef.current.inFlight) return;
      const now = Date.now();
      if (now-pendingFetchRef.current.lastAt < 4000) return;
      pendingFetchRef.current.lastAt = now;
      pendingFetchRef.current.inFlight = true;

      try {
        const pending = await listPendingIntakeQuestions(limit);
        for (const messageRaw of pending || []) {
          if (!messageRaw) continue;
          const messageId = String((messageRaw as { id?: unknown })?.id ?? "").trim();
          if (!messageId) continue;
          if (seenRef.current.has(messageId)) continue;

          const kind = messageKindFromMetadata((messageRaw as { metadata?: JsonInput })?.metadata);
          if (kind !== "path_intake_questions" && kind !== "path_intake_review") continue;

          const threadId = String(
            (messageRaw as { threadId?: unknown; thread_id?: unknown })?.threadId ?? (messageRaw as { thread_id?: unknown })?.thread_id ?? ""
          ).trim();
          if (!threadId) continue;
          if (isOnThread(pathnameRef.current, threadId)) continue;

          const content = String((messageRaw as { content?: unknown })?.content ?? "").trim();
          const workflow = workflowFromMetadata((messageRaw as { metadata?: JsonInput })?.metadata);
          const workflowActions = workflow?.actions ?? [];
          const toastQuickActions = workflowActions.filter((a) => String(a.variant || "").toLowerCase() !== "subtle").slice(0, 2);

          const toastId = `path-intake:${kind}:${messageId}`;
          const toastCopy = toastCopyForKind(kind, t);

          const quickToastActions = toastQuickActions.map((a) => ({
            label: a.label,
            className: toastActionClassForVariant(a.variant),
            onClick: () => {
              const idem = `intake-quick:${messageId}:${a.token}`.slice(0, 180);
              void sendChatMessage(threadId, a.token, { idempotencyKey: idem })
                .then(() => toast.dismiss(toastId))
                .catch((err) => {
                  console.error("[IntakeNotifications] quick reply failed:", err);
                  toast.push({
                    variant: "error",
                    title: t("pathIntake.dialog.sendFailed"),
                    description: t("pathIntake.dialog.sendFailed"),
                  });
                });
            },
          }));

          toast.push({
            id: toastId,
            variant: "info",
            durationMs: 0,
            title: toastCopy.title,
            description: toastCopy.description,
            actions: [
              ...quickToastActions,
              {
                label: toastCopy.actionLabel,
                onClick: () => {
                  setDialogThreadId(threadId);
                  setDialogSourceMessageId(messageId);
                  setDialogQuestions(content);
                  setDialogWorkflowActions(workflowActions);
                  setDialogToastId(toastId);
                  setAnswer("");
                  setSendError("");
                  setDialogOpen(true);
                },
              },
              {
                label: t("pathIntake.toast.openChat"),
                onClick: () => {
                  toast.dismiss(toastId);
                  navigate(threadRouteFor(threadId));
                },
              },
            ],
          });

          seenRef.current.add(messageId);
        }
      } catch (err) {
        console.warn("[IntakeNotifications] pending intake fetch failed:", err);
      } finally {
        pendingFetchRef.current.inFlight = false;
      }
    },
    [navigate, t, toast, user?.id]
  );

  useEffect(() => {
    fetchPending(3);
  }, [fetchPending]);

  useEffect(() => {
    if (!connected) return;
    fetchPending(3);
  }, [connected, fetchPending]);

  useEffect(() => {
    if (!user?.id) return;
    const list = Array.isArray(messages) ? messages : [];
    if (list.length === 0) return;

    for (const m of list) {
      if (!m) continue;
      if (String(m.channel || "") !== String(user.id)) continue;
      if (String(m.event || "") !== "ChatMessageCreated") continue;

      const data = (m.data || {}) as Record<string, unknown>;
      const threadIdRaw = data.thread_id ?? data.threadId ?? "";
      const messageRaw = data.message as ChatMessage | null | undefined;
      if (!messageRaw) continue;

      const messageId = String((messageRaw as { id?: unknown })?.id ?? "").trim();
      if (!messageId) continue;
      if (seenRef.current.has(messageId)) continue;

      const kind = messageKindFromMetadata((messageRaw as { metadata?: JsonInput })?.metadata);
      if (kind !== "path_intake_questions" && kind !== "path_intake_review") continue;

      const threadId = String(
        threadIdRaw ||
          (messageRaw as { thread_id?: unknown; threadId?: unknown })?.thread_id ||
          (messageRaw as { threadId?: unknown })?.threadId ||
          ""
      ).trim();
      if (!threadId) continue;
      if (isOnThread(location.pathname, threadId)) {
        seenRef.current.add(messageId);
        continue;
      }

      const content = String((messageRaw as { content?: unknown })?.content ?? "").trim();
      const workflow = workflowFromMetadata((messageRaw as { metadata?: JsonInput })?.metadata);
      const workflowActions = workflow?.actions ?? [];
      const toastQuickActions = workflowActions.filter((a) => String(a.variant || "").toLowerCase() !== "subtle").slice(0, 2);

      const toastId = `path-intake:${kind}:${messageId}`;
      const toastCopy = toastCopyForKind(kind, t);

      const quickToastActions = toastQuickActions.map((a) => ({
        label: a.label,
        className: toastActionClassForVariant(a.variant),
        onClick: () => {
          const idem = `intake-quick:${messageId}:${a.token}`.slice(0, 180);
          void sendChatMessage(threadId, a.token, { idempotencyKey: idem })
            .then(() => toast.dismiss(toastId))
            .catch((err) => {
              console.error("[IntakeNotifications] quick reply failed:", err);
              toast.push({
                variant: "error",
                title: t("pathIntake.dialog.sendFailed"),
                description: t("pathIntake.dialog.sendFailed"),
              });
            });
        },
      }));

      toast.push({
        id: toastId,
        variant: "info",
        durationMs: 0,
        title: toastCopy.title,
        description: toastCopy.description,
        actions: [
          ...quickToastActions,
          {
            label: toastCopy.actionLabel,
            onClick: () => {
              setDialogThreadId(threadId);
              setDialogSourceMessageId(messageId);
              setDialogQuestions(content);
              setDialogWorkflowActions(workflowActions);
              setDialogToastId(toastId);
              setAnswer("");
              setSendError("");
              setDialogOpen(true);
            },
          },
          {
            label: t("pathIntake.toast.openChat"),
            onClick: () => {
              toast.dismiss(toastId);
              navigate(threadRouteFor(threadId));
            },
          },
        ],
      });

      seenRef.current.add(messageId);
    }
  }, [messages, user?.id, location.pathname, toast, navigate, t]);

  const handleSend = async () => {
    if (!canSend) return;
    setSending(true);
    setSendError("");
    try {
      await sendChatMessage(dialogThreadId, answer.trim(), { idempotencyKey: generateIdempotencyKey() });
      if (dialogToastId) toast.dismiss(dialogToastId);
      setDialogOpen(false);
      setAnswer("");
    } catch (err) {
      console.error("[IntakeNotifications] send failed:", err);
      setSendError(t("pathIntake.dialog.sendFailed"));
    } finally {
      setSending(false);
    }
  };

  const handleQuickSend = async (token: string) => {
    const trimmed = String(token || "").trim();
    if (!trimmed || !dialogThreadId) return;
    if (sending) return;
    setSending(true);
    setSendError("");
    try {
      const idem = dialogSourceMessageId ? `intake-dialog-quick:${dialogSourceMessageId}:${trimmed}`.slice(0, 180) : generateIdempotencyKey();
      await sendChatMessage(dialogThreadId, trimmed, { idempotencyKey: idem });
      if (dialogToastId) toast.dismiss(dialogToastId);
      setDialogOpen(false);
      setAnswer("");
    } catch (err) {
      console.error("[IntakeNotifications] quick send failed:", err);
      setSendError(t("pathIntake.dialog.sendFailed"));
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={dialogOpen} onOpenChange={(open) => !sending && setDialogOpen(open)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("pathIntake.dialog.title")}</DialogTitle>
          <DialogDescription>{t("pathIntake.dialog.description")}</DialogDescription>
        </DialogHeader>

        {normalizedQuestions ? (
          <div className="space-y-2">
            <div className="text-xs font-semibold text-muted-foreground">{t("pathIntake.dialog.questionsLabel")}</div>
            <div className="max-h-[38vh] overflow-auto rounded-xl border border-border bg-muted/20 p-3 text-sm text-foreground">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{normalizedQuestions}</ReactMarkdown>
            </div>
          </div>
        ) : null}

        {quickActions.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            {quickActions.map((a) => (
              <Button
                key={a.id}
                type="button"
                variant={String(a.variant || "").toLowerCase() === "primary" ? "default" : "outline"}
                size="sm"
                onClick={() => void handleQuickSend(a.token)}
                disabled={sending}
              >
                {a.label}
              </Button>
            ))}
          </div>
        ) : null}

        <div className="space-y-2">
          <Textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder={t("pathIntake.dialog.answerPlaceholder")}
            className="min-h-[110px]"
            disabled={sending}
          />
          {sendError ? <div className="text-xs text-destructive">{sendError}</div> : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={sending}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleSend} disabled={!canSend}>
            {sending ? t("pathIntake.dialog.sending") : t("pathIntake.dialog.send")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
