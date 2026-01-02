import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { ChatMessage } from "@/features/chat/components/ChatMessage";
import { AnimatedChatbar } from "@/features/chat/components/AnimatedChatbar";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Textarea } from "@/shared/ui/textarea";
import { getChatThread, listChatMessages, mapChatMessage, sendChatMessage } from "@/shared/api/ChatService";
import { cancelJob as apiCancelJob, restartJob as apiRestartJob } from "@/shared/api/JobService";
import { enqueuePathNodeDocPatch, getPathNodeContent, getPathNodeDoc } from "@/shared/api/PathNodeService";
import { useSSEContext } from "@/app/providers/SSEProvider";
import { useUser } from "@/app/providers/UserProvider";
import { useActivityPanel } from "@/app/providers/ActivityPanelProvider";
import { ArrowDown } from "lucide-react";
import { clampPct, stageLabel } from "@/shared/lib/learningBuildStages";
import { Container } from "@/shared/layout/Container";
import type { ChatMessage as ChatMessageModel, ChatThread, JsonInput, PathNode } from "@/shared/types/models";

type DeltaState = { attempt: number; deltaSeq: number };

type ChatMessageItem = Partial<ChatMessageModel> & {
  id: string;
  seq: number;
  role: string;
  status: string;
  content: string;
  error?: string;
};

const BOTTOM_THRESHOLD = 32;

interface DocBlock {
  id?: string;
  type?: string;
  text?: string;
  md?: string;
  title?: string;
  code?: string;
  caption?: string;
  asset?: { url?: string | null };
  url?: string;
  source?: string;
  prompt_md?: string;
}

interface DocShape {
  blocks?: DocBlock[];
}

interface LocationState {
  jobId?: string | null;
}

function getErrorMessage(err: unknown, fallback: string) {
  if (typeof err === "string" && err.trim()) return err;
  if (err instanceof Error && err.message) return err.message;
  if (!err || typeof err !== "object") return fallback;
  const maybeResponse = (err as { response?: { data?: { error?: unknown } } }).response;
  const responseError = maybeResponse?.data?.error;
  if (typeof responseError === "string" && responseError.trim()) return responseError;
  return fallback;
}

function generateIdempotencyKey() {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch (err) {
    void err;
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function parseIntSafe(v: unknown, def = 0) {
  const n = typeof v === "number" ? v : Number.parseInt(String(v || ""), 10);
  return Number.isFinite(n) ? n : def;
}

function parseDeltaState(meta: Record<string, unknown> | null | undefined): DeltaState {
  const attempt = parseIntSafe(meta?.attempt, 0);
  const deltaSeq = parseIntSafe(meta?.delta_seq, 0);
  return { attempt, deltaSeq };
}

function safeParseJSON(v: unknown): unknown {
  if (!v) return null;
  if (typeof v === "object") return v;
  if (typeof v === "string") {
    try {
      return JSON.parse(v);
    } catch {
      return null;
    }
  }
  return null;
}

function normalizeDoc(doc: JsonInput): DocShape | null {
  const d = safeParseJSON(doc) ?? doc;
  if (!d || typeof d !== "object" || Array.isArray(d)) return null;
  return d as DocShape;
}

function clampSnippet(text: unknown, max = 160) {
  const s = String(text || "").trim().replace(/\s+/g, " ");
  if (!s) return "";
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

function summarizeBlock(block: DocBlock | null | undefined) {
  if (!block) return "";
  const type = String(block?.type || "").toLowerCase();
  if (type === "heading") return clampSnippet(block?.text);
  if (type === "paragraph") return clampSnippet(block?.md);
  if (type === "callout") return clampSnippet(block?.title || block?.md);
  if (type === "code") return clampSnippet(block?.code);
  if (type === "figure") return clampSnippet(block?.caption || block?.asset?.url);
  if (type === "video") return clampSnippet(block?.caption || block?.url);
  if (type === "diagram") return clampSnippet(block?.caption || block?.source);
  if (type === "table") return clampSnippet(block?.caption);
  if (type === "quick_check") return clampSnippet(block?.prompt_md);
  return clampSnippet(JSON.stringify(block));
}

function upsertByID(list: ChatMessageItem[], msg: ChatMessageItem) {
  if (!msg?.id) return list;
  const idx = (list || []).findIndex((m) => m?.id === msg.id);
  if (idx === -1) {
    return [...(list || []), msg].sort((a, b) => (a?.seq || 0) - (b?.seq || 0));
  }
  const next = [...list];
  next[idx] = { ...next[idx], ...msg };
  return next.sort((a, b) => (a?.seq || 0) - (b?.seq || 0));
}

function appendDeltaWithDedupe(
  list: ChatMessageItem[],
  messageId: string,
  delta: string,
  attempt: number,
  deltaSeq: number,
  deltaStateRef: React.MutableRefObject<Map<string, DeltaState>>
) {
  if (!messageId || !delta) return list;
  const prevState = deltaStateRef.current.get(messageId) || { attempt: -1, deltaSeq: 0 };
  if (attempt < prevState.attempt) return list;
  if (attempt === prevState.attempt && deltaSeq <= prevState.deltaSeq) return list;

  if (attempt > prevState.attempt) {
    deltaStateRef.current.set(messageId, { attempt, deltaSeq });
  } else {
    deltaStateRef.current.set(messageId, { attempt, deltaSeq: deltaSeq || prevState.deltaSeq });
  }

  const idx = (list || []).findIndex((m) => m?.id === messageId);
  if (idx === -1) {
    const maxSeq = Math.max(0, ...(list || []).map((m) => Number(m?.seq) || 0));
    return [...(list || []), { id: messageId, role: "assistant", status: "streaming", content: delta, seq: maxSeq + 1 }];
  }

  const next = [...list];
  const cur = next[idx] || {};

  // If this is a newer attempt, reset content to avoid mixing retries.
  const content = attempt > prevState.attempt ? String(delta) : `${cur.content || ""}${delta}`;
  next[idx] = { ...cur, content, status: "streaming" };
  return next;
}

function WaveText({ text }: { text: string }) {
  const chars = Array.from(String(text || ""));
  return (
    <span aria-label={text}>
      {chars.map((ch, i) => (
        <span
          key={i}
          className="nb-wave-char"
          style={{ animationDelay: `${i * 0.035}s` }}
        >
          {ch === " " ? "\u00A0" : ch}
        </span>
      ))}
    </span>
  );
}

export default function ChatThreadPage() {
  const { id: threadId } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const { user } = useUser();
  const { lastMessage } = useSSEContext();
  const { setActiveJobId, openForJob, items, activeJobId, activeJob, activeJobStatus } = useActivityPanel();

  const [loading, setLoading] = useState(false);
  const [thread, setThread] = useState<ChatThread | null>(null);
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [sendError, setSendError] = useState("");

  const [blockNode, setBlockNode] = useState<PathNode | null>(null);
  const [blockDoc, setBlockDoc] = useState<JsonInput>(null);
  const [blockDocLoaded, setBlockDocLoaded] = useState(false);
  const [revisionInstruction, setRevisionInstruction] = useState("");
  const [revisionDialogOpen, setRevisionDialogOpen] = useState(false);
  const [revisionSubmitting, setRevisionSubmitting] = useState(false);
  const [revisionError, setRevisionError] = useState("");
  const [revisionQueued, setRevisionQueued] = useState(false);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const stickRef = useRef(true);
  const startedAtRef = useRef<number>(Date.now());
  const deltaStateRef = useRef<Map<string, DeltaState>>(new Map()); // message_id -> {attempt, deltaSeq}

  const getScrollDistance = useCallback(() => {
    const el = scrollRef.current;
    if (el && el.scrollHeight - el.clientHeight > 1) {
      return el.scrollHeight - (el.scrollTop + el.clientHeight);
    }
    if (typeof document === "undefined") return 0;
    const doc = document.documentElement;
    const body = document.body;
    const scrollTop = doc.scrollTop || body.scrollTop || 0;
    const scrollHeight = doc.scrollHeight || body.scrollHeight || 0;
    const clientHeight = doc.clientHeight || window.innerHeight || 0;
    return scrollHeight - (scrollTop + clientHeight);
  }, []);

  const updateScrollState = useCallback(() => {
    const dist = getScrollDistance();
    const atBottom = dist <= BOTTOM_THRESHOLD;
    stickRef.current = atBottom;
    setShowScrollToBottom((prev) => {
      const next = !atBottom;
      return prev === next ? prev : next;
    });
  }, [getScrollDistance]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const el = scrollRef.current;
    if (el && el.scrollHeight - el.clientHeight > 1) {
      el.scrollTo({ top: el.scrollHeight, behavior });
      return;
    }
    if (typeof window === "undefined") return;
    const doc = document.documentElement;
    const body = document.body;
    const scrollHeight = doc.scrollHeight || body.scrollHeight || 0;
    window.scrollTo({ top: scrollHeight, behavior });
  }, []);

  const onScroll = useCallback(() => {
    updateScrollState();
  }, [updateScrollState]);

  useEffect(() => {
    if (!threadId) return;
    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const { thread: t, messages: ms } = await getChatThread(threadId, 100);
        if (cancelled) return;
        setThread(t);
        setMessages(ms);
        startedAtRef.current = Date.now();
        deltaStateRef.current.clear();
      } catch (err) {
        console.error("[ChatThreadPage] Failed to load thread:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [threadId]);

  const blockNodeId = useMemo(() => {
    const v = String(searchParams.get("nodeId") || "").trim();
    return v || null;
  }, [searchParams]);

  const blockId = useMemo(() => {
    const v = String(searchParams.get("blockId") || "").trim();
    return v || null;
  }, [searchParams]);

  const blockTypeParam = useMemo(() => {
    const v = String(searchParams.get("blockType") || "").trim();
    return v || "";
  }, [searchParams]);

  useEffect(() => {
    if (!blockNodeId || !blockId) return;
    let cancelled = false;
    setBlockDocLoaded(false);
    setRevisionQueued(false);
    setRevisionError("");

    (async () => {
      try {
        const [doc, node] = await Promise.all([
          getPathNodeDoc(blockNodeId),
          getPathNodeContent(blockNodeId),
        ]);
        if (cancelled) return;
        setBlockNode(node || null);
        setBlockDoc(doc || null);
      } catch (err) {
        if (!cancelled) {
          console.warn("[ChatThreadPage] Failed to load block context:", err);
          setBlockNode(null);
          setBlockDoc(null);
        }
      } finally {
        if (!cancelled) setBlockDocLoaded(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [blockNodeId, blockId]);

  const blockContext = useMemo<{ block: DocBlock; summary: string } | null>(() => {
    if (!blockId) return null;
    const d = normalizeDoc(blockDoc);
    const blocks = Array.isArray(d?.blocks) ? d.blocks : [];
    const found = blocks.find((b) => String(b?.id || "") === String(blockId));
    if (!found) return null;
    return {
      block: found,
      summary: summarizeBlock(found),
    };
  }, [blockDoc, blockId]);

  // Best-effort: if we navigated here from an upload response, start tracking the build job immediately.
  useEffect(() => {
    const locationState = location.state as LocationState | null | undefined;
    const jid = locationState?.jobId;
    if (!jid) return;
    if (String(activeJobId || "") === String(jid)) return;
    startedAtRef.current = Date.now();
    setActiveJobId(String(jid));
  }, [location?.state, activeJobId, setActiveJobId]);

  const isPathBuildThread = useMemo(() => {
    const md = thread?.metadata;
    const fallback = Boolean(thread?.pathId && thread?.jobId);
    if (!md) return fallback;
    if (typeof md === "object" && !Array.isArray(md)) {
      return String((md as Record<string, unknown>).kind || "").toLowerCase() === "path_build" || fallback;
    }
    if (typeof md === "string") {
      try {
        const obj = JSON.parse(md);
        return String(obj?.kind || "").toLowerCase() === "path_build" || fallback;
      } catch {
        return fallback;
      }
    }
    return fallback;
  }, [thread?.metadata, thread?.pathId, thread?.jobId]);

  // If this thread is attached to a learning_build job, hook it into the Activity panel + inline "thinking" feed.
  useEffect(() => {
    if (!isPathBuildThread) return;
    const jid = thread?.jobId;
    if (!jid) return;
    if (String(activeJobId || "") === String(jid)) return;
    startedAtRef.current = Date.now();
    setActiveJobId(String(jid));
  }, [thread?.jobId, activeJobId, setActiveJobId, isPathBuildThread]);

  const buildJobId = useMemo(() => {
    if (!isPathBuildThread) return null;
    return thread?.jobId ? String(thread.jobId) : null;
  }, [isPathBuildThread, thread?.jobId]);

  // Apply SSE chat events for this thread.
  useEffect(() => {
    if (!lastMessage) return;
    if (!user?.id) return;
    if (lastMessage.channel !== user.id) return;
    if (!threadId) return;

    const event = String(lastMessage.event || "");
    const data = (lastMessage.data || {}) as Record<string, unknown>;
    const tid = String(data.thread_id ?? data.threadId ?? "");
    if (tid && tid !== String(threadId)) return;

    if (event === "ChatMessageCreated" || event === "ChatMessageDone") {
      const msg = mapChatMessage(data.message as ChatMessageModel | null);
      if (!msg) return;
      setMessages((prev) => upsertByID(prev, msg));
      return;
    }

    if (event === "ChatMessageDelta") {
      const messageId = String(data.message_id ?? data.messageId ?? "");
      const delta = String(data.delta ?? "");
      const meta = data || {};
      const { attempt, deltaSeq } = parseDeltaState(meta);
      setMessages((prev) =>
        appendDeltaWithDedupe(prev, messageId, delta, attempt, deltaSeq, deltaStateRef)
      );
      return;
    }

    if (event === "ChatMessageError") {
      const messageId = String(data.message_id ?? data.messageId ?? "");
      const error = String(data.error ?? "Unknown error");
      if (!messageId) return;
      setMessages((prev) => {
        const idx = (prev || []).findIndex((m) => m?.id === messageId);
        if (idx === -1) return prev;
        const next = [...prev];
        next[idx] = { ...next[idx], status: "error", error };
        return next;
      });
      return;
    }
  }, [lastMessage, user?.id, threadId]);

  const hasStreaming = useMemo(
    () => (messages || []).some((m) => String(m?.status || "").toLowerCase() === "streaming"),
    [messages]
  );

  // Fallback: if we have streaming messages, poll to converge even if SSE drops.
  useEffect(() => {
    if (!threadId) return;
    if (!hasStreaming) return;

    let cancelled = false;
    const tick = async () => {
      try {
        const fresh = await listChatMessages(threadId, { limit: 120 });
        if (cancelled) return;
        setMessages(fresh);
      } catch (err) {
        console.warn("[ChatThreadPage] Poll messages failed:", err);
      }
    };

    const t = setInterval(tick, 2000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [threadId, hasStreaming]);

  useEffect(() => {
    if (!stickRef.current) return;
    requestAnimationFrame(() => scrollToBottom("auto"));
  }, [messages.length, items.length, scrollToBottom]);

  useEffect(() => {
    requestAnimationFrame(() => updateScrollState());
  }, [messages.length, items.length, updateScrollState]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => updateScrollState();
    window.addEventListener("scroll", handler, { passive: true });
    window.addEventListener("resize", handler);
    return () => {
      window.removeEventListener("scroll", handler);
      window.removeEventListener("resize", handler);
    };
  }, [updateScrollState]);

  const thinkingDuration = useMemo(() => {
    const ms = Date.now() - startedAtRef.current;
    const s = Math.max(0, Math.floor(ms / 1000));
    if (s < 60) return `${s} seconds`;
    const m = Math.floor(s / 60);
    const r = s % 60;
    if (m < 60) return r ? `${m}m ${r}s` : `${m}m`;
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return rm ? `${h}h ${rm}m` : `${h}h`;
  }, [items.length]);

  const learningBuildStatus = useMemo(() => {
    if (!buildJobId) return "";
    const panelStatus =
      String(activeJobId || "") === String(buildJobId)
        ? String(activeJobStatus || "").toLowerCase()
        : "";
    return panelStatus || "";
  }, [buildJobId, activeJobId, activeJobStatus]);

  const learningBuildActive = useMemo(() => {
    if (!buildJobId) return false;
    // Treat unknown status as active until we converge via polling.
    return learningBuildStatus === "" || learningBuildStatus === "queued" || learningBuildStatus === "running";
  }, [buildJobId, learningBuildStatus]);

  const learningBuildCanceled = useMemo(() => learningBuildStatus === "canceled", [learningBuildStatus]);

  const lastAssistantMessage = useMemo(() => {
    const list = (messages || []).slice().reverse();
    return list.find((m) => String(m?.role || "").toLowerCase() === "assistant" && String(m?.content || "").trim());
  }, [messages]);

  const handleUseLastAssistant = useCallback(() => {
    if (!lastAssistantMessage?.content) return;
    setRevisionInstruction(String(lastAssistantMessage.content || "").trim());
  }, [lastAssistantMessage]);

  const handleApplyRevision = useCallback(async () => {
    if (!blockNodeId || !blockId) return;
    const instruction = String(revisionInstruction || "").trim();
    if (!instruction) {
      setRevisionError("Add the revision you want applied to this block.");
      return;
    }
    setRevisionSubmitting(true);
    setRevisionError("");
    try {
      const payload = [
        "Rewrite this block using the user-approved revision below.",
        "Keep the block id and type unchanged.",
        "REVISION:",
        instruction,
      ].join("\n");
      await enqueuePathNodeDocPatch(blockNodeId, {
        block_id: blockId,
        action: "rewrite",
        citation_policy: "reuse_only",
        instruction: payload,
      });
      setRevisionQueued(true);
      setRevisionDialogOpen(false);
    } catch (err) {
      setRevisionError(getErrorMessage(err, "Failed to apply revision"));
    } finally {
      setRevisionSubmitting(false);
    }
  }, [blockNodeId, blockId, revisionInstruction]);

  const goToNode = useCallback(() => {
    if (!blockNodeId) return;
    navigate(`/path-nodes/${blockNodeId}`);
  }, [blockNodeId, navigate]);

  const handleCancelBuild = useCallback(async () => {
    const jid = buildJobId;
    if (!jid) return;
    try {
      await apiCancelJob(jid);
    } catch (err) {
      console.error("[ChatThreadPage] cancel job failed:", err);
    }
  }, [buildJobId]);

  const handleRestartBuild = useCallback(async () => {
    const jid = buildJobId;
    if (!jid) return;
    try {
      await apiRestartJob(jid);
    } catch (err) {
      console.error("[ChatThreadPage] restart job failed:", err);
    }
  }, [buildJobId]);

  const thinkingSteps = useMemo(() => {
    if (!learningBuildActive && !learningBuildCanceled) return null;

    const firstId = String((items || [])[0]?.id || "");
    const list =
      buildJobId && firstId.includes(String(buildJobId)) ? (items || []).slice(0, 200) : [];
    const summaryIndex = list.findIndex((it) => String(it?.id || "").startsWith("summary:"));
    const summary =
      summaryIndex >= 0 ? list[summaryIndex] : list.length > 0 ? list[list.length - 1] : null;
    const stages =
      summaryIndex >= 0
        ? list.filter((_, idx) => idx !== summaryIndex)
        : list.slice(0, Math.max(0, list.length - 1));
    const title = summary?.title || stageLabel(String(activeJob?.stage || "")) || "Generating path…";
    const progress = clampPct(summary?.progress ?? activeJob?.progress);
    const msg = String(summary?.content || "").trim();

    return (
      <div className="space-y-1.5">
        {stages.length > 0 && (
          <div className="space-y-1">
            {stages.map((it) => (
              <button
                key={it.id || `${it.title}-${it.progress}`}
                type="button"
                onClick={() => buildJobId && openForJob(buildJobId)}
                className="block w-full text-left hover:text-foreground transition-colors"
              >
                <span className="font-medium text-foreground">{it.title}</span>
                <span className="text-muted-foreground">
                  {typeof it.progress === "number" ? ` — ${Math.round(it.progress)}%` : ""}
                  {it.content ? ` — ${it.content}` : ""}
                </span>
              </button>
            ))}
          </div>
        )}

        <div className={stages.length > 0 ? "pt-2" : ""}>
          <button
            type="button"
            onClick={() => buildJobId && openForJob(buildJobId)}
            className="w-full text-left hover:text-foreground transition-colors"
          >
            <span className="font-semibold text-foreground">
              <WaveText text={stageLabel(title) || title} />
            </span>
            <span className="text-muted-foreground">
              {" "}
              — {Math.round(progress)}%
              {msg ? ` — ${msg}` : ""}
            </span>
          </button>
        </div>

        {learningBuildCanceled ? (
          <div className="pt-3">
            <button
              type="button"
              onClick={handleRestartBuild}
              className="inline-flex items-center justify-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Regenerate
            </button>
          </div>
        ) : null}
      </div>
    );
  }, [items, buildJobId, activeJob?.stage, activeJob?.progress, learningBuildActive, learningBuildCanceled, openForJob, handleRestartBuild]);

  const handleSend = useCallback(
    async (text: string) => {
      const trimmed = String(text || "").trim();
      if (!trimmed) return;
      if (!threadId) return;

      setSendError("");
      const idempotencyKey = generateIdempotencyKey();
      // Optimistically echo; the backend will also emit ChatMessageCreated for both messages.
      try {
        const out = await sendChatMessage(threadId, trimmed, { idempotencyKey });
        const userMessage = out?.userMessage ?? null;
        const assistantMessage = out?.assistantMessage ?? null;
        if (userMessage) setMessages((prev) => upsertByID(prev, userMessage));
        if (assistantMessage) setMessages((prev) => upsertByID(prev, assistantMessage));
        requestAnimationFrame(() => scrollToBottom("smooth"));
      } catch (err) {
        const raw = getErrorMessage(err, "send_failed");
        const msg = raw.toLowerCase().includes("thread is busy")
          ? "The assistant is still responding. Try again in a moment."
          : "Failed to send message. Please try again.";
        setSendError(msg);
        console.error("[ChatThreadPage] send message failed:", err);
        throw err;
      }
    },
    [threadId, scrollToBottom]
  );

  const renderMessageContent = useCallback((msg: ChatMessageItem): React.ReactNode => {
    const role = String(msg?.role || "").toLowerCase();
    const content = String(msg?.content || "");
    const status = String(msg?.status || "").toLowerCase();

    if (role === "user") return content;

    if (status === "error") {
      const errText = String(msg?.error || "").trim();
      return (
        <div className="text-sm text-destructive">
          {errText ? `Error: ${errText}` : "Error: Something went wrong."}
        </div>
      );
    }

    if (status === "streaming" && !content.trim()) {
      return <div className="text-sm text-muted-foreground animate-pulse">Thinking…</div>;
    }

    return (
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({
            inline,
            className,
            children,
          }: {
            inline?: boolean;
            className?: string;
            children?: React.ReactNode;
          }) {
            const raw = String(children || "");
            const m = /language-([a-zA-Z0-9_-]+)/.exec(className || "");
            const lang = m?.[1] || "";
            if (inline) return <ChatMessage.InlineCode>{raw}</ChatMessage.InlineCode>;
            return <ChatMessage.CodeBlock language={lang}>{raw.replace(/\n$/, "")}</ChatMessage.CodeBlock>;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    );
  }, []);

  const goToPath = useCallback(() => {
    if (!thread?.pathId) return;
    navigate(`/paths/${thread.pathId}`);
  }, [navigate, thread?.pathId]);

  const blockLabel = blockTypeParam || blockContext?.block?.type || "block";
  const hasRevisionText = String(revisionInstruction || "").trim().length > 0;

  return (
    <div className="h-full min-h-0 bg-background flex flex-col">
      <style>{`
        @keyframes nbWaveBreath {
          0%, 100% { transform: translateY(0); opacity: 1; }
          50% { transform: translateY(-2px); opacity: 0.78; }
        }
        .nb-wave-char {
          display: inline-block;
          animation: nbWaveBreath 1.35s ease-in-out infinite;
        }
      `}</style>

      <div ref={scrollRef} onScroll={onScroll} className="flex-1 min-h-0 overflow-y-auto">
        <Container size="sm" className="page-pad-compact">
          {loading && !thread ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : null}

          {thread?.pathId ? (
            <div className="mb-3">
              <button
                type="button"
                onClick={goToPath}
                className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4"
              >
                View path
              </button>
            </div>
          ) : null}

          {blockNodeId && blockId ? (
            <div className="mb-6 rounded-xl border border-border bg-muted/20 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Block revision
                  </div>
                  <div className="mt-1 text-sm font-semibold text-foreground">
                    {blockLabel}
                  </div>
                  {blockNode?.title ? (
                    <div className="mt-1 text-xs text-muted-foreground">
                      Unit: {blockNode.title}
                    </div>
                  ) : null}
                  {blockContext?.summary ? (
                    <div className="mt-2 text-xs text-muted-foreground">
                      “{blockContext.summary}”
                    </div>
                  ) : blockDocLoaded ? (
                    <div className="mt-2 text-xs text-muted-foreground">
                      Block details unavailable. You can still apply revisions.
                    </div>
                  ) : (
                    <div className="mt-2 text-xs text-muted-foreground">
                      Loading block details…
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={goToNode}>
                    Open unit
                  </Button>
                </div>
              </div>

              <div className="mt-4 space-y-2">
                <Textarea
                  value={revisionInstruction}
                  onChange={(e) => setRevisionInstruction(e.target.value)}
                  placeholder="Describe exactly how you want this block revised."
                  className="min-h-[120px] resize-none bg-background"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => setRevisionDialogOpen(true)}
                    disabled={revisionSubmitting || !hasRevisionText}
                  >
                    Review & Apply
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleUseLastAssistant}
                    disabled={!lastAssistantMessage?.content}
                  >
                    Use last assistant reply
                  </Button>
                  {revisionQueued ? (
                    <span className="text-xs text-muted-foreground">
                      Revision queued. Open the unit to confirm.
                    </span>
                  ) : null}
                </div>
                {revisionError ? (
                  <div className="text-xs text-destructive">{revisionError}</div>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="space-y-2">
            {(messages || []).map((m) => (
              <ChatMessage key={m.id} variant={String(m.role || "").toLowerCase() === "user" ? "user" : "assistant"}>
                {renderMessageContent(m)}
              </ChatMessage>
            ))}

            {thinkingSteps ? (
              <ChatMessage
                variant="system"
                showActions={false}
                thinkingContent={thinkingSteps}
                thinkingDuration={thinkingDuration}
                thinkingDefaultExpanded
              />
            ) : null}
          </div>
        </Container>
      </div>

      <div className="shrink-0 sticky bottom-0 z-10 bg-background">
        <div className="relative pb-5">
          {showScrollToBottom && (
            <button
              type="button"
              onClick={() => scrollToBottom("smooth")}
              className="absolute left-1/2 top-0 z-30 flex h-11 w-11 -translate-x-1/2 -translate-y-[calc(50%+6px)] items-center justify-center rounded-full border border-border bg-background/95 shadow-lg transition hover:bg-muted"
              aria-label="Scroll to bottom"
            >
              <ArrowDown className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
          {thread ? (
            <>
              {sendError ? (
                <Container size="sm" className="pb-2 text-xs text-destructive">
                  {sendError}
                </Container>
              ) : null}
              <AnimatedChatbar
                className="max-w-3xl"
                disablePlaceholderAnimation
                disableUploads
                submitMode={learningBuildActive ? "cancel" : "send"}
                onSubmit={(text) => (learningBuildActive ? handleCancelBuild() : handleSend(text))}
              />
            </>
          ) : (
            <Container size="sm">
              <div className="h-14 w-full rounded-3xl border border-border bg-muted/30" />
            </Container>
          )}
        </div>
      </div>

      <Dialog open={revisionDialogOpen} onOpenChange={(open) => !revisionSubmitting && setRevisionDialogOpen(open)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Apply revision to this block?</DialogTitle>
            <DialogDescription>
              This will rewrite the selected block using the revision text below. You can undo from the unit page if needed.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground whitespace-pre-wrap">
            {revisionInstruction || "No revision provided."}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevisionDialogOpen(false)} disabled={revisionSubmitting}>
              Cancel
            </Button>
            <Button onClick={handleApplyRevision} disabled={revisionSubmitting || !hasRevisionText}>
              {revisionSubmitting ? "Applying…" : "Apply revision"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
