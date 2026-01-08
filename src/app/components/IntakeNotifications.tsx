import React, { useEffect, useMemo, useRef, useState } from "react";
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
import { sendChatMessage } from "@/shared/api/ChatService";
import type { ChatMessage, JsonInput } from "@/shared/types/models";

type JsonRecord = Record<string, unknown>;

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
  const { lastMessage } = useSSEContext();
  const { user } = useUser();
  const toast = useToast();
  const location = useLocation();
  const navigate = useNavigate();

  const seenRef = useRef<Set<string>>(new Set());

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogThreadId, setDialogThreadId] = useState<string>("");
  const [dialogQuestions, setDialogQuestions] = useState<string>("");
  const [dialogToastId, setDialogToastId] = useState<string>("");
  const [answer, setAnswer] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");

  const normalizedQuestions = useMemo(() => String(dialogQuestions || "").trim(), [dialogQuestions]);
  const canSend = useMemo(() => !sending && Boolean(answer.trim()) && Boolean(dialogThreadId), [sending, answer, dialogThreadId]);

  useEffect(() => {
    if (!lastMessage) return;
    if (!user?.id) return;
    if (String(lastMessage.channel || "") !== String(user.id)) return;
    if (String(lastMessage.event || "") !== "ChatMessageCreated") return;

    const data = (lastMessage.data || {}) as Record<string, unknown>;
    const threadIdRaw = data.thread_id ?? data.threadId ?? "";
    const messageRaw = data.message as ChatMessage | null | undefined;
    if (!messageRaw) return;

    const messageId = String((messageRaw as { id?: unknown })?.id ?? "").trim();
    if (!messageId) return;
    if (seenRef.current.has(messageId)) return;

    const kind = messageKindFromMetadata((messageRaw as { metadata?: JsonInput })?.metadata);
    if (kind !== "path_intake_questions") return;

    const threadId = String(threadIdRaw || (messageRaw as { thread_id?: unknown; threadId?: unknown })?.thread_id || (messageRaw as { threadId?: unknown })?.threadId || "").trim();
    if (!threadId) return;
    if (isOnThread(location.pathname, threadId)) {
      seenRef.current.add(messageId);
      return;
    }

    const content = String((messageRaw as { content?: unknown })?.content ?? "").trim();
    const toastId = `path-intake:${messageId}`;

    toast.push({
      id: toastId,
      variant: "info",
      durationMs: 0,
      title: t("pathIntake.toast.title"),
      description: t("pathIntake.toast.description"),
      actions: [
        {
          label: t("pathIntake.toast.answerHere"),
          onClick: () => {
            setDialogThreadId(threadId);
            setDialogQuestions(content);
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
  }, [lastMessage, user?.id, location.pathname, toast, navigate, t]);

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
