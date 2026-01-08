import { useState, useEffect, useRef, useCallback } from "react";
import type { ChangeEvent, DragEvent, FormEvent, PointerEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Mic, Square, ChevronLeft, ChevronRight, ArrowUp } from "lucide-react";
import { IconButton } from "@/shared/ui/icon-button";
import { Input } from "@/shared/ui/input";
import { cn } from "@/shared/lib/utils";
import { FileUploadCard } from "@/shared/components/FileUploadCard";
import { usePaths } from "@/app/providers/PathProvider";
import type { BackendMaterialUploadResponse } from "@/shared/types/backend";
import { useI18n } from "@/app/providers/I18nProvider";

const examplePrompts = [
  "Teach me how to study effectively.",
  "Help me build a weekly study plan.",
  "Teach me active recall and spaced repetition.",
  "Explain the basics of genetics.",
  "Teach me amino acids and what to memorize.",
  "Help me understand the Krebs cycle.",
  "Teach me the electron transport chain.",
  "Explain acid–base like I’m new to it.",
  "Teach me ECG basics and how to read them.",
  "Explain cardiac action potentials.",
  "Teach me blood pressure regulation.",
  "Help me learn antibiotics and their classes.",
  "Teach me how to approach pharmacology.",
  "Explain the immune system fundamentals.",
  "Teach me inflammation and cytokines basics.",
  "Help me understand renal physiology.",
  "Teach me endocrine feedback loops.",
  "Explain diabetes types and management basics.",
  "Teach me neuroanatomy pathways basics.",
  "Help me learn cranial nerves quickly.",
  "Teach me how to do a patient presentation.",
  "Explain how to interpret lab values.",
  "Teach me basic biostatistics for exams.",
  "Help me understand research papers.",
  "Teach me how to start learning Python.",
  "Teach me SQL fundamentals.",
  "Help me learn React basics.",
  "Teach me machine learning fundamentals.",
  "Teach me personal finance basics.",
  "Teach me public speaking fundamentals."
];

type PlaceholderPhase = "typing" | "pause" | "deleting" | "swap";

export interface ChatUploadFile {
  id: string;
  name: string;
  size: number;
  type: string;
  file: File;
}

interface DragState {
  active: boolean;
  startX: number;
  scrollLeft: number;
  pointerId: number | null;
}

interface AnimatedChatbarProps {
  onSubmit?: (value: string, files?: ChatUploadFile[]) => void | Promise<void>;
  onUpload?: (files: File[]) => Promise<BackendMaterialUploadResponse>;
  className?: string;
  disablePlaceholderAnimation?: boolean;
  disableUploads?: boolean;
  respectReducedMotion?: boolean;
  submitMode?: "send" | "cancel";
  variant?: "default" | "navbar";
}

export const AnimatedChatbar = ({
  onSubmit,
  onUpload,
  className,
  disablePlaceholderAnimation = false,
  disableUploads = false,
  respectReducedMotion = true,
  submitMode = "send", // "send" | "cancel"
  variant = "default",
}: AnimatedChatbarProps) => {
  const navigate = useNavigate();
  const { t } = useI18n();
  const { uploadMaterialSet } = usePaths();
  const [value, setValue] = useState("");
  const [placeholder, setPlaceholder] = useState("");
  const [currentPromptIndex, setCurrentPromptIndex] = useState(
    () => Math.floor(Math.random() * examplePrompts.length)
  );
  const [, setCharIndex] = useState(0);
  const [phase, setPhase] = useState<PlaceholderPhase>("typing");
  const [isFocused, setIsFocused] = useState(false);
  const [files, setFiles] = useState<ChatUploadFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [swapFade, setSwapFade] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const [inView, setInView] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const rootRef = useRef<HTMLFormElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const placeholderStepRef = useRef<((ts: number) => void) | null>(null);
  const placeholderLastFrameAtRef = useRef<number>(0);
  const activeRef = useRef(false);
  const filesStripRef = useRef<HTMLDivElement | null>(null);
  const dragFilesRef = useRef<DragState>({ active: false, startX: 0, scrollLeft: 0, pointerId: null });
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);
  const [isDraggingFilesStrip, setIsDraggingFilesStrip] = useState(false);

  const isCancelMode = String(submitMode || "").toLowerCase() === "cancel";
  const canSend = isCancelMode || value.trim().length > 0 || (!disableUploads && files.length > 0);
  const sendDisabled = !canSend || isGenerating;
  const isNavbar = String(variant || "").toLowerCase() === "navbar";
  const showFilesStrip = !isNavbar && !disableUploads && files.length > 0;
  const showFilesPill = isNavbar && !disableUploads && files.length > 0;

  const updateFilesScroll = useCallback(() => {
    const el = filesStripRef.current;
    if (!el) return;
    const max = Math.max(0, el.scrollWidth - el.clientWidth);
    const x = el.scrollLeft;
    setCanScrollPrev(x > 2);
    setCanScrollNext(x < max - 2);
  }, []);

  useEffect(() => {
    updateFilesScroll();
  }, [files.length, updateFilesScroll]);

  useEffect(() => {
    if (!disableUploads) return;
    if (files.length === 0) return;
    setFiles([]);
  }, [disableUploads, files.length]);

  useEffect(() => {
    const el = filesStripRef.current;
    if (!el) return;

    updateFilesScroll();

    let ro: ResizeObserver | null = null;
    const onResize = () => updateFilesScroll();

    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(onResize);
      ro.observe(el);
    } else {
      window.addEventListener("resize", onResize);
    }

    return () => {
      ro?.disconnect?.();
      window.removeEventListener("resize", onResize);
    };
  }, [updateFilesScroll]);

  const scrollFilesBy = useCallback((delta: number) => {
    const el = filesStripRef.current;
    if (!el) return;
    el.scrollTo({ left: el.scrollLeft + delta * 280, behavior: "smooth" });
  }, []);

  const onFilesPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "touch") return;
    if (e.button !== 0) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest("button")) return;

    const el = filesStripRef.current;
    if (!el) return;

    dragFilesRef.current.active = true;
    dragFilesRef.current.pointerId = e.pointerId;
    dragFilesRef.current.startX = e.clientX;
    dragFilesRef.current.scrollLeft = el.scrollLeft;

    setIsDraggingFilesStrip(true);
    el.setPointerCapture(e.pointerId);
  };

  const onFilesPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragFilesRef.current.active) return;

    const el = filesStripRef.current;
    if (!el) return;

    const dx = e.clientX - dragFilesRef.current.startX;
    el.scrollLeft = dragFilesRef.current.scrollLeft - dx;

    updateFilesScroll();
  };

  const endFilesDrag = () => {
    if (!dragFilesRef.current.active) return;

    const el = filesStripRef.current;
    const pid = dragFilesRef.current.pointerId;

    dragFilesRef.current.active = false;
    dragFilesRef.current.pointerId = null;

    if (el && pid != null) {
      try { el.releasePointerCapture(pid); } catch (err) { void err; }
    }

    setIsDraggingFilesStrip(false);
  };

  const machineRef = useRef({
    promptIndex: currentPromptIndex,
    charIndex: 0,
    phase: "typing" as PlaceholderPhase,
    placeholder: "",
    swapFade: false,
    nextAt: 0,
  });

  const showGhost = !disablePlaceholderAnimation && !isFocused && value.length === 0;
  const shouldReduceMotion = respectReducedMotion && reducedMotion;
  const visibleForPlaceholderAnim = isNavbar || inView;

  const stopAnim = useCallback(() => {
    activeRef.current = false;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    placeholderStepRef.current = null;
    placeholderLastFrameAtRef.current = 0;
  }, []);

  useEffect(() => {
    return () => stopAnim();
  }, [stopAnim]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;

    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReducedMotion(!!mq.matches);

    onChange();

    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else mq.addListener(onChange);

    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", onChange);
      else mq.removeListener(onChange);
    };
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;

    const onVis = () => setPageVisible(!document.hidden);

    onVis();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("IntersectionObserver" in window)) return;

    const el = rootRef.current;
    if (!el) return;

    const obs = new IntersectionObserver(
      (entries) => {
        const entry = entries && entries[0];
        setInView(!!entry?.isIntersecting);
      },
      { threshold: 0.01 }
    );

    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (isFocused || value.length > 0) {
      stopAnim();

      const m = machineRef.current;
      m.charIndex = 0;
      m.phase = "typing";
      m.placeholder = "";
      m.swapFade = false;
      m.nextAt = 0;

      setCharIndex(0);
      setPhase("typing");
      setPlaceholder("");
      setSwapFade(false);
    }
  }, [isFocused, value, stopAnim]);

  useEffect(() => {
    if (!showGhost) return;

    if (shouldReduceMotion) {
      stopAnim();

      const m = machineRef.current;
      m.charIndex = 0;
      m.phase = "typing";
      m.placeholder = isCancelMode ? t("chat.input.placeholder.cancel") : t("chat.input.placeholder.ask");
      m.swapFade = false;
      m.nextAt = 0;

      setCharIndex(0);
      setPhase("typing");
      setPlaceholder(isCancelMode ? t("chat.input.placeholder.cancel") : t("chat.input.placeholder.ask"));
      setSwapFade(false);
    }
  }, [isCancelMode, shouldReduceMotion, showGhost, stopAnim, t]);

  useEffect(() => {
    if (!showGhost) {
      stopAnim();
      return;
    }

    if (shouldReduceMotion) {
      stopAnim();
      return;
    }

    if (!pageVisible || !visibleForPlaceholderAnim) {
      stopAnim();
      return;
    }

    activeRef.current = true;

    const TYPE_BASE = 34;
    const TYPE_JITTER = 6;
    const DELETE_BASE = 18;
    const DELETE_JITTER = 4;
    const PAUSE_AFTER_TYPED = 850;
    const PAUSE_TO_DELETE_MS = 160;
    const SWAP_FADE_MS = 120;
    const AFTER_SWAP_DELAY = 60;

    const jitter = (base: number, amt: number) =>
      Math.max(0, Math.round(base + (Math.random() * 2 - 1) * amt));

    const extraDelayForChar = (ch: string) => {
      if (!ch) return 0;
      if (/[.,!?]/.test(ch)) return 90;
      if (ch === " ") return 10;
      return 0;
    };

    const step = (ts: number) => {
      if (!activeRef.current) {
        rafRef.current = null;
        return;
      }

      placeholderLastFrameAtRef.current = ts;

      try {
        const now = ts;
        const m = machineRef.current;

        if (m.nextAt === 0) m.nextAt = now;

        if (now >= m.nextAt) {
          const prompt = examplePrompts[m.promptIndex] || "";

          if (m.phase === "typing") {
            if (m.charIndex < prompt.length) {
              const nextChar = prompt[m.charIndex];

              m.placeholder = m.placeholder + nextChar;
              m.charIndex = m.charIndex + 1;

              setPlaceholder(m.placeholder);
              setCharIndex(m.charIndex);

              m.nextAt =
                now +
                jitter(TYPE_BASE, TYPE_JITTER) +
                extraDelayForChar(nextChar);
            } else {
              m.phase = "pause";
              setPhase("pause");
              m.nextAt = now + PAUSE_AFTER_TYPED;
            }
          } else if (m.phase === "pause") {
            m.phase = "deleting";
            setPhase("deleting");
            m.nextAt = now + PAUSE_TO_DELETE_MS;
          } else if (m.phase === "deleting") {
            if (m.charIndex > 0) {
              m.placeholder = m.placeholder.slice(0, -1);
              m.charIndex = m.charIndex - 1;

              setPlaceholder(m.placeholder);
              setCharIndex(m.charIndex);

              m.nextAt = now + jitter(DELETE_BASE, DELETE_JITTER);
            } else {
              if (!m.swapFade) {
                m.swapFade = true;
                setSwapFade(true);
                m.placeholder = "";
                setPlaceholder("");
                m.phase = "swap";
                setPhase("swap");
                m.nextAt = now + SWAP_FADE_MS;
              }
            }
          } else if (m.phase === "swap") {
            m.swapFade = false;
            setSwapFade(false);

            m.promptIndex = (m.promptIndex + 1) % examplePrompts.length;
            setCurrentPromptIndex(m.promptIndex);

            m.charIndex = 0;
            setCharIndex(0);

            m.placeholder = "";
            setPlaceholder("");

            m.phase = "typing";
            setPhase("typing");

            m.nextAt = now + AFTER_SWAP_DELAY;
          }
        }
      } catch (err) {
        console.warn("[AnimatedChatbar] Placeholder animation tick failed; restarting", err);
        const m = machineRef.current;
        m.charIndex = 0;
        m.phase = "typing";
        m.placeholder = "";
        m.swapFade = false;
        m.nextAt = 0;

        setCharIndex(0);
        setPhase("typing");
        setPlaceholder("");
        setSwapFade(false);
      }

      if (!activeRef.current) {
        rafRef.current = null;
        return;
      }

      rafRef.current = requestAnimationFrame(step);
    };

    placeholderStepRef.current = step;
    rafRef.current = requestAnimationFrame(step);

    return () => stopAnim();

  }, [
    showGhost,
    shouldReduceMotion,
    pageVisible,
    visibleForPlaceholderAnim,
    stopAnim,
  ]);

  useEffect(() => {
    if (!showGhost) return;
    if (shouldReduceMotion) return;
    if (!pageVisible) return;
    if (!visibleForPlaceholderAnim) return;

    if (typeof window === "undefined") return;

    const STALL_MS = 4000;

    const intervalId = window.setInterval(() => {
      if (!activeRef.current) return;
      const step = placeholderStepRef.current;
      if (!step) return;

      const now = typeof performance !== "undefined" ? performance.now() : Date.now();
      const last = placeholderLastFrameAtRef.current;
      const stalled = last > 0 && now - last > STALL_MS;

      if (!stalled) return;

      console.warn("[AnimatedChatbar] Placeholder animation stalled; restarting");
      const m = machineRef.current;
      m.nextAt = 0;

      if (rafRef.current != null) {
        try {
          cancelAnimationFrame(rafRef.current);
        } catch (err) {
          void err;
        }
      }
      rafRef.current = requestAnimationFrame(step);
    }, 1500);

    return () => window.clearInterval(intervalId);
  }, [showGhost, shouldReduceMotion, pageVisible, visibleForPlaceholderAnim]);

  const handleFocus = () => {
    setIsFocused(true);
  };

  const handleBlur = () => {
    setIsFocused(false);
  };

  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    addFiles(e.dataTransfer.files);
  };

  const handleRemoveFile = (fileToRemove: ChatUploadFile) => {
    setFiles((prev) => prev.filter((f) => f.id !== fileToRemove.id));
  };

  const handleSubmit = useCallback(async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isGenerating) return;

    const uploadFn = onUpload || uploadMaterialSet;
    const filesToUpload = disableUploads ? [] : files.map((f) => f.file);

    if (!isCancelMode && !value.trim() && filesToUpload.length === 0) {
      return;
    }

    if (filesToUpload.length > 0) {
      if (!uploadFn) return;
    }

    setIsGenerating(true);

    let nextJobId: string | null = null;
    let nextThreadId: string | null = null;

    if (filesToUpload.length > 0) {
      console.log(
        "[AnimatedChatbar] Uploading files:",
        filesToUpload.map((f) => f.name),
      );
      try {
        const res = await uploadFn(filesToUpload);
        const jobId = res?.job_id ?? res?.jobId ?? null;
        const threadId = res?.thread_id ?? res?.threadId ?? null;
        nextJobId =
          typeof jobId === "string" || typeof jobId === "number" ? String(jobId) : null;
        nextThreadId =
          typeof threadId === "string" || typeof threadId === "number" ? String(threadId) : null;
      } catch (err) {
        console.error("[AnimatedChatbar] uploadMaterialSet failed:", err);
        setIsGenerating(false);
        return;
      }
    }

    try {
      await Promise.resolve(onSubmit?.(value, files));
      setValue("");
      setFiles([]);
    } catch (err) {
      console.error("[AnimatedChatbar] onSubmit failed:", err);
    } finally {
      setIsGenerating(false);
    }

    if (nextThreadId) {
      navigate(`/chat/threads/${nextThreadId}`, {
        state: { jobId: nextJobId ?? null },
      });
    } else if (nextJobId) {
      navigate(`/paths/build/${nextJobId}`);
    }
  }, [files, value, onSubmit, onUpload, uploadMaterialSet, isGenerating, navigate, disableUploads, isCancelMode]);

  const addFiles = (incoming: File[] | FileList | null | undefined) => {
    const arr = Array.isArray(incoming) ? incoming : Array.from(incoming || []);
    if (arr.length === 0) return;
    const newFiles = arr.map((file) => ({
      id: `${file.name}-${file.size}-${file.lastModified}`,
      name: file.name,
      size: file.size,
      type: file.type,
      file,
    }));
    setFiles((prev) => {
      const seen = new Set(prev.map((f) => f.id));
      const merged = [...prev];
      for (const f of newFiles) {
        if (!seen.has(f.id)) merged.push(f);
      }
      return merged;
    });
  };

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    addFiles(e.target.files);
    e.target.value = "";
  };

  const ghostClass = showGhost
    ? (swapFade ? "opacity-0 translate-y-0" : "opacity-100 translate-y-0")
    : "opacity-0 translate-y-1";

  return (
    <form
      ref={rootRef}
      onSubmit={handleSubmit}
      className={cn(
        isNavbar ? "w-full" : "w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8",
        className
      )}
    >
      <style>{`
        @keyframes nbCaretBlink {
          0%, 49% { opacity: 1; }
          50%, 100% { opacity: 0; }
        }
        @keyframes nbCaretPulse {
          0%, 100% { transform: translateZ(0) scaleY(1); opacity: 1; }
          50% { transform: translateZ(0) scaleY(0.86); opacity: 0.92; }
        }
      `}</style>
      {!disableUploads && (
        <input
          ref={fileInputRef}
          type="file"
          className="hidden bg-transparent"
          multiple
          onChange={handleFileInputChange}
          style={{ display: "none" }}
        />
      )}
      <div
        className={cn(
          isNavbar
            ? `
          relative bg-background/70 border border-border/60 dark:border-border rounded-full px-2 py-1.5
          shadow-sm transition-shadow nb-duration-micro nb-ease-out motion-reduce:transition-none hover:shadow-md focus-within:shadow-md`
            : `
          relative bg-background border border-border rounded-3xl px-3
          sm:px-4 sm:px-4 py-3 sm:py-3.5 shadow-sm transition-shadow nb-duration-micro nb-ease-out motion-reduce:transition-none
          hover:shadow-md focus-within:shadow-md`,
          isDragging && !disableUploads && "ring-2 ring-primary/40 ring-offset-2 ring-offset-background"
        )}
        onDragEnter={disableUploads ? undefined : handleDragEnter}
        onDragLeave={disableUploads ? undefined : handleDragLeave}
        onDragOver={disableUploads ? undefined : handleDragOver}
        onDrop={disableUploads ? undefined : handleDrop}
      >
        {showFilesStrip && (
          <div className="relative mb-2 -mx-1 px-1">
            <div
              ref={filesStripRef}
              className={cn(
                "flex items-start gap-2 overflow-x-auto overscroll-x-contain pb-1 scroll-smooth snap-x snap-proximity select-none [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden",
                isDraggingFilesStrip ? "cursor-grabbing" : "cursor-grab"
              )}
              style={{ WebkitOverflowScrolling: "touch" }}
              onScroll={updateFilesScroll}
              onPointerDown={onFilesPointerDown}
              onPointerMove={onFilesPointerMove}
              onPointerUp={endFilesDrag}
              onPointerCancel={endFilesDrag}
              onWheel={(e) => {
                const el = e.currentTarget;
                const canScrollX = el.scrollWidth > el.clientWidth;
                if (!canScrollX) return;
                if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
                el.scrollLeft += e.deltaY;
              }}
            >
              {files.map((file) => (
                <div key={file.id} className="shrink-0 snap-start">
                  <FileUploadCard
                    fileName={file.name}
                    fileType={file.type}
                    onRemove={() => handleRemoveFile(file)}
                  />
                </div>
              ))}
            </div>

            {canScrollPrev && (
              <IconButton
                type="button"
                variant="ghost"
                size="icon"
                className="absolute start-0 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-background/80 backdrop-blur-sm shadow-sm border border-border"
                label={t("chat.files.scroll.prev")}
                shortcut="Left"
                onClick={() => scrollFilesBy(-1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </IconButton>
            )}

            {canScrollNext && (
              <>
                <IconButton
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute end-0 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-background/80 backdrop-blur-sm shadow-sm border border-border"
                  label={t("chat.files.scroll.next")}
                  shortcut="Right"
                  onClick={() => scrollFilesBy(1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </IconButton>
                <div
                  className={cn(
                    "pointer-events-none absolute inset-y-0 end-0 w-10 from-background to-transparent",
                    "bg-gradient-to-l"
                  )}
                />
              </>
            )}
          </div>
        )}
        <div className={cn("flex items-center", isNavbar ? "gap-2" : "gap-2 sm:gap-3")}>
          {!disableUploads && (
            <IconButton
              type="button"
              variant="ghost"
              size="icon"
              className={cn(
                "rounded-full shrink-0 hover:bg-muted",
                isNavbar ? "h-8 w-8" : "h-8 w-8 sm:h-9"
              )}
              label={t("chat.files.attach")}
              shortcut="Cmd/Ctrl+O"
              onClick={() => fileInputRef.current?.click()}
            >
              <Plus className="h-5 w-5 sm:h-5 sm:w-5" />
            </IconButton>
          )}
          {showFilesPill && (
            <button
              type="button"
              onClick={() => setFiles([])}
              className="inline-flex shrink-0 items-center rounded-full border border-border/50 bg-muted/40 px-2 py-1 text-xs font-medium text-muted-foreground transition-colors nb-duration-micro nb-ease-out motion-reduce:transition-none hover:bg-muted"
              aria-label={`Clear ${files.length} attached file${files.length === 1 ? "" : "s"}`}
              title="Clear attached files"
            >
              {files.length} file{files.length === 1 ? "" : "s"}
            </button>
          )}
          <div className="relative flex-1 min-w-0">
            <div
              aria-hidden="true"
              className={cn(
                cn(
                  "pointer-events-none absolute inset-y-0 left-0 right-0 flex items-center transition-[opacity,transform] nb-duration nb-ease-out transform-gpu motion-reduce:transition-none",
                  isNavbar ? "px-2" : "px-3"
                ),
                ghostClass
              )}
            >
              <div className="relative flex min-w-0 items-center">
                <span className="truncate text-sm sm:text-base text-muted-foreground">
                  {placeholder}
                </span>
                <span
                  className={cn(
                    "ms-1 inline-block w-[2px] h-[1.05em] rounded-full bg-current align-[-0.125em]",
                    phase === "typing" ? "text-foreground/60" : "text-muted-foreground/70"
                  )}
                  style={{
                    transformOrigin: "center",
                    willChange: "transform, opacity",
                    animation: reducedMotion
                      ? "none"
                      : phase === "typing"
                        ? "nbCaretPulse 1.35s ease-in-out infinite"
                        : phase === "pause" || phase === "swap"
                          ? "nbCaretBlink 1.05s step-end infinite"
                          : "nbCaretBlink 0.75s step-end infinite",
                    boxShadow: !reducedMotion && phase === "typing" ? "0 0 10px currentColor" : "none",
                  }}
                />
                <div
                  className={cn(
                    "pointer-events-none absolute inset-y-0 end-0 w-10 from-background to-transparent",
                    "bg-gradient-to-l"
                  )}
                />
              </div>
            </div>
            <Input
              ref={inputRef}
              dir="auto"
              type="text"
              value={value}
              disabled={isCancelMode || isGenerating}
              onChange={(e) => setValue(e.target.value)}
              onFocus={handleFocus}
              onBlur={handleBlur}
              placeholder={isCancelMode ? t("chat.input.placeholder.cancel") : t("chat.input.placeholder.ask")}
              aria-label={t("chat.input.aria")}
              className={cn(
                "w-full !bg-transparent text-sm sm:text-base text-foreground placeholder:text-muted-foreground",
                "border-0 outline-none",
                "shadow-none ring-0 ring-offset-0 ring-offset-transparent",
                "focus:shadow-none focus:ring-0 focus:ring-offset-0 focus:bg-transparent",
                "focus-visible:shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:bg-transparent",
                "[--tw-ring-color:transparent] [--tw-ring-offset-color:transparent]",
                "autofill:shadow-[inset_0_0_0px_1000px_transparent]",
                "autofill:text-fill-foreground",
                showGhost && "placeholder:opacity-0",
                isNavbar && "h-8 text-sm"
              )}
            />
          </div>
          <div
            className="flex items-center gap-1 sm:gap-2 shrink-0"
          >
            {!isNavbar && (
              <IconButton
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 sm:h-9 rounded-full hover:bg-muted"
                label={t("chat.voiceInput")}
                shortcut="V"
              >
                <Mic className="h-4 w-4 sm:h-5 sm:w-5" />
              </IconButton>
            )}
            <IconButton
              type="submit"
              variant="ghost"
              size="icon"
              disabled={sendDisabled}
              className={cn(
                cn(
                  "rounded-full hover:bg-muted",
                  isNavbar ? "h-8 w-8" : "h-8 w-8 sm:h-9 sm:w-9"
                ),
                sendDisabled && "text-muted-foreground/40 hover:bg-transparent"
              )}
              label={isCancelMode ? t("chat.cancelGeneration") : t("chat.send")}
              shortcut={isCancelMode ? "Esc" : "Enter"}
            >
              {isGenerating || isCancelMode ? (
                <Square className="h-4 w-4 sm:h-4 sm:w-4 fill-current" />
              ) : (
                <ArrowUp className="h-4 w-4 sm:h-4 sm:w-4" />
              )}
            </IconButton>
          </div>
        </div>
      </div>
    </form>
  );
}
