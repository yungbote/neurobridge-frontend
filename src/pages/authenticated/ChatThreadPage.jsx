import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { ChatMessage } from "@/components/app/ChatMessage";
import { AnimatedChatbar } from "@/components/app/AnimatedChatbar";
import { getChatThread, listChatMessages, mapChatMessage, sendChatMessage } from "@/api/ChatService";
import { useSSEContext } from "@/providers/SSEProvider";
import { useUser } from "@/providers/UserProvider";
import { useActivityPanel } from "@/providers/ActivityPanelProvider";
import { clampPct, stageLabel } from "@/lib/learningBuildStages";

function generateIdempotencyKey() {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch {}
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function parseIntSafe(v, def = 0) {
  const n = typeof v === "number" ? v : Number.parseInt(String(v || ""), 10);
  return Number.isFinite(n) ? n : def;
}

function parseDeltaState(meta) {
  const attempt = parseIntSafe(meta?.attempt, 0);
  const deltaSeq = parseIntSafe(meta?.delta_seq, 0);
  return { attempt, deltaSeq };
}

function upsertByID(list, msg) {
  if (!msg?.id) return list;
  const idx = (list || []).findIndex((m) => m?.id === msg.id);
  if (idx === -1) {
    return [...(list || []), msg].sort((a, b) => (a?.seq || 0) - (b?.seq || 0));
  }
  const next = [...list];
  next[idx] = { ...next[idx], ...msg };
  return next.sort((a, b) => (a?.seq || 0) - (b?.seq || 0));
}

function appendDeltaWithDedupe(list, messageId, delta, attempt, deltaSeq, deltaStateRef) {
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

function WaveText({ text }) {
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
  const { id: threadId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const { user } = useUser();
  const { lastMessage } = useSSEContext();
  const { setActiveJobId, openForJob, items, activeJobId } = useActivityPanel();

  const [loading, setLoading] = useState(false);
  const [thread, setThread] = useState(null);
  const [messages, setMessages] = useState([]);

  const scrollRef = useRef(null);
  const stickRef = useRef(true);
  const startedAtRef = useRef(Date.now());
  const deltaStateRef = useRef(new Map()); // message_id -> {attempt, deltaSeq}

  const scrollToBottom = useCallback((behavior = "auto") => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const dist = el.scrollHeight - (el.scrollTop + el.clientHeight);
    stickRef.current = dist < 160;
  }, []);

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

  // Best-effort: if we navigated here from an upload response, start tracking the build job immediately.
  useEffect(() => {
    const jid = location?.state?.jobId;
    if (!jid) return;
    if (String(activeJobId || "") === String(jid)) return;
    startedAtRef.current = Date.now();
    setActiveJobId(String(jid));
  }, [location?.state, activeJobId, setActiveJobId]);

  const isPathBuildThread = useMemo(() => {
    const md = thread?.metadata;
    if (!md) return false;
    if (typeof md === "object") return String(md.kind || "").toLowerCase() === "path_build";
    if (typeof md === "string") {
      try {
        const obj = JSON.parse(md);
        return String(obj?.kind || "").toLowerCase() === "path_build";
      } catch {
        return false;
      }
    }
    return false;
  }, [thread?.metadata]);

  // If this thread is attached to a learning_build job, hook it into the Activity panel + inline "thinking" feed.
  useEffect(() => {
    if (!isPathBuildThread) return;
    const jid = thread?.jobId;
    if (!jid) return;
    if (String(activeJobId || "") === String(jid)) return;
    startedAtRef.current = Date.now();
    setActiveJobId(String(jid));
  }, [thread?.jobId, activeJobId, setActiveJobId, isPathBuildThread]);

  // Apply SSE chat events for this thread.
  useEffect(() => {
    if (!lastMessage) return;
    if (!user?.id) return;
    if (lastMessage.channel !== user.id) return;
    if (!threadId) return;

    const event = String(lastMessage.event || "");
    const data = lastMessage.data || {};
    const tid = String(data.thread_id ?? data.threadId ?? "");
    if (tid && tid !== String(threadId)) return;

    if (event === "ChatMessageCreated" || event === "ChatMessageDone") {
      const msg = mapChatMessage(data.message);
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

  const learningBuildActive = useMemo(() => {
    if (!isPathBuildThread) return false;
    const jid = thread?.jobId;
    if (!jid) return false;
    if (String(activeJobId || "") !== String(jid)) return false;
    const last = (items || [])[items.length - 1] || null;
    const done = String(last?.title || "").toLowerCase() === "done" && clampPct(last?.progress) >= 100;
    return !done;
  }, [thread?.jobId, activeJobId, items, isPathBuildThread]);

  const thinkingSteps = useMemo(() => {
    const list = (items || []).slice(-80);
    const last = list[list.length - 1] || null;
    const title = last?.title || "Generating path…";
    const progress = clampPct(last?.progress);
    const msg = String(last?.content || "").trim();

    if (!learningBuildActive) return null;

    return (
      <div className="space-y-1.5">
        <button
          type="button"
          onClick={() => thread?.jobId && openForJob(thread.jobId)}
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

        {list.length > 0 && (
          <div className="pt-2 space-y-1">
            {list.map((it) => (
              <button
                key={it.id || `${it.title}-${it.progress}`}
                type="button"
                onClick={() => thread?.jobId && openForJob(thread.jobId)}
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
      </div>
    );
  }, [items, learningBuildActive, openForJob, thread?.jobId]);

  const handleSend = useCallback(
    async (text) => {
      const trimmed = String(text || "").trim();
      if (!trimmed) return;
      if (!threadId) return;

      const idempotencyKey = generateIdempotencyKey();
      // Optimistically echo; the backend will also emit ChatMessageCreated for both messages.
      try {
        const out = await sendChatMessage(threadId, trimmed, { idempotencyKey });
        if (out?.userMessage) setMessages((prev) => upsertByID(prev, out.userMessage));
        if (out?.assistantMessage) setMessages((prev) => upsertByID(prev, out.assistantMessage));
        requestAnimationFrame(() => scrollToBottom("smooth"));
      } catch (err) {
        console.error("[ChatThreadPage] send message failed:", err);
      }
    },
    [threadId, scrollToBottom]
  );

  const renderMessageContent = useCallback((msg) => {
    const role = String(msg?.role || "").toLowerCase();
    const content = String(msg?.content || "");

    if (role === "user") return content;

    return (
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ inline, className, children }) {
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
        <div className="mx-auto w-full max-w-3xl px-4 py-8">
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
        </div>
      </div>

      <div className="shrink-0 mb-5 bg-background/80 backdrop-blur">
        <AnimatedChatbar
          className="max-w-3xl"
          disablePlaceholderAnimation
          disableUploads
          onSubmit={(text) => handleSend(text)}
        />
      </div>
    </div>
  );
}
