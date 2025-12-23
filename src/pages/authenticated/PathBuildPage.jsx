import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { usePaths } from "@/providers/PathProvider";
import { useActivityPanel } from "@/providers/ActivityPanelProvider";
import { ChatMessage } from "@/components/app/ChatMessage";
import { AnimatedChatbar } from "@/components/app/AnimatedChatbar";
import { clampPct, stageLabel } from "@/lib/learningBuildStages";

function hasJobFields(p) {
  return (
    !!p?.jobId ||
    !!p?.jobStatus ||
    !!p?.jobStage ||
    typeof p?.jobProgress === "number" ||
    !!p?.jobMessage
  );
}

function formatDuration(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s} seconds`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m < 60) return r ? `${m}m ${r}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm ? `${h}h ${rm}m` : `${h}h`;
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

export default function PathBuildPage() {
  const { jobId } = useParams();
  const navigate = useNavigate();

  const { paths, getById } = usePaths();
  const { setOpen, setActiveJobId, donePathId, items } = useActivityPanel();

  const [userMessages, setUserMessages] = useState([]);

  const scrollRef = useRef(null);
  const stickRef = useRef(true);
  const startedAtRef = useRef(Date.now());

  useEffect(() => {
    if (!jobId) return;
    startedAtRef.current = Date.now();
    setActiveJobId(jobId);
  }, [jobId, setActiveJobId]);

  useEffect(() => {
    if (!donePathId) return;

    const p = getById?.(donePathId) || null;
    if (p && !hasJobFields(p)) {
      navigate(`/paths/${donePathId}`, { replace: true });
      return;
    }

    const t = setTimeout(() => {
      navigate(`/paths/${donePathId}`, { replace: true });
    }, 2500);

    return () => clearTimeout(t);
  }, [donePathId, getById, navigate]);

  const jobRow = useMemo(() => {
    if (!jobId) return null;
    return (paths || []).find((p) => String(p?.jobId || "") === String(jobId)) || null;
  }, [paths, jobId]);

  const currentTitle = stageLabel(jobRow?.jobStage) || "Generating path…";
  const currentProgress = clampPct(jobRow?.jobProgress);
  const currentMessage = String(jobRow?.jobMessage || "").trim();
  const thinkingDuration = formatDuration(Date.now() - startedAtRef.current);

  const openActivity = useCallback(() => setOpen(true), [setOpen]);

  const thinkingSteps = useMemo(() => {
    const list = (items || []).slice(-80);

    return (
      <div className="space-y-1.5">
        <button
          type="button"
          onClick={openActivity}
          className="w-full text-left hover:text-foreground transition-colors"
        >
          <span className="font-semibold text-foreground">
            <WaveText text={currentTitle} />
          </span>
          <span className="text-muted-foreground">
            {" "}
            — {Math.round(currentProgress)}%
            {currentMessage ? ` — ${currentMessage}` : ""}
          </span>
        </button>

        {list.length > 0 && (
          <div className="pt-2 space-y-1">
            {list.map((it) => (
              <button
                key={it.id || `${it.title}-${it.progress}`}
                type="button"
                onClick={openActivity}
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
  }, [items, currentTitle, currentProgress, currentMessage, openActivity]);

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
    if (!stickRef.current) return;
    requestAnimationFrame(() => scrollToBottom("auto"));
  }, [userMessages.length, items.length, currentTitle, currentProgress, scrollToBottom]);

  const handleComposerSubmit = useCallback(
    (text, uploaded) => {
      const trimmed = String(text || "").trim();
      const hasFiles = Array.isArray(uploaded) && uploaded.length > 0;
      if (!trimmed && !hasFiles) return;

      setUserMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          text: trimmed || (hasFiles ? "Uploaded files" : ""),
        },
      ]);

      requestAnimationFrame(() => scrollToBottom("smooth"));
    },
    [scrollToBottom]
  );

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

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 min-h-0 overflow-y-auto"
      >
        <div className="mx-auto w-full max-w-3xl px-4 py-8">
          <div className="space-y-2">
            {userMessages.map((m) => (
              <ChatMessage key={m.id} variant="user">
                {m.text}
              </ChatMessage>
            ))}

            <ChatMessage
              variant="system"
              showActions={false}
              thinkingContent={thinkingSteps}
              thinkingDuration={thinkingDuration}
              thinkingDefaultExpanded
              disableThinkingToggle
              onThinkingHeaderClick={openActivity}
            />
          </div>
        </div>
      </div>

      <div className="shrink-0 mb-5 bg-background/80 backdrop-blur">
        <AnimatedChatbar
          className="max-w-3xl"
          disablePlaceholderAnimation
          onSubmit={handleComposerSubmit}
        />
      </div>
    </div>
  );
}









