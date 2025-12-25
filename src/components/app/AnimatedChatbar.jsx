import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Mic, Square, ChevronLeft, ChevronRight, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { FileUploadCard } from "@/components/app/FileUploadCard";
import { usePaths } from "@/providers/PathProvider";

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

export const AnimatedChatbar = ({
  onSubmit,
  onUpload,
  className,
  disablePlaceholderAnimation = false,
  disableUploads = false,
  submitMode = "send", // "send" | "cancel"
}) => {
  const navigate = useNavigate();
  const { uploadMaterialSet } = usePaths();
  const [value, setValue] = useState("");
  const [placeholder, setPlaceholder] = useState("");
  const [currentPromptIndex, setCurrentPromptIndex] = useState(
    () => Math.floor(Math.random() * examplePrompts.length)
  );
  const [, setCharIndex] = useState(0);
  const [phase, setPhase] = useState("typing");
  const [isFocused, setIsFocused] = useState(false);
  const [files, setFiles] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [swapFade, setSwapFade] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const [inView, setInView] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const rootRef = useRef(null);
  const rafRef = useRef(null);
  const activeRef = useRef(false);
  const filesStripRef = useRef(null);
  const dragFilesRef = useRef({ active: false, startX: 0, scrollLeft: 0, pointerId: null });
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [isDraggingFilesStrip, setIsDraggingFilesStrip] = useState(false);

  const isCancelMode = String(submitMode || "").toLowerCase() === "cancel";
  const canSend = isCancelMode || value.trim().length > 0 || (!disableUploads && files.length > 0);
  const sendDisabled = !canSend || isGenerating;

  const updateFilesScroll = useCallback(() => {
    const el = filesStripRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const x = el.scrollLeft;
    setCanScrollLeft(x > 2);
    setCanScrollRight(x < max - 2);
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

    let ro;
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

  const scrollFilesBy = useCallback((dir) => {
    const el = filesStripRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * 280, behavior: "smooth" });
  }, []);

  const onFilesPointerDown = (e) => {
    if (e.pointerType === "touch") return;
    if (e.button !== 0) return;
    if (e.target.closest("button")) return;

    const el = filesStripRef.current;
    if (!el) return;

    dragFilesRef.current.active = true;
    dragFilesRef.current.pointerId = e.pointerId;
    dragFilesRef.current.startX = e.clientX;
    dragFilesRef.current.scrollLeft = el.scrollLeft;

    setIsDraggingFilesStrip(true);
    el.setPointerCapture(e.pointerId);
  };

  const onFilesPointerMove = (e) => {
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
    phase: "typing",
    placeholder: "",
    swapFade: false,
    nextAt: 0,
  });

  const showGhost = !disablePlaceholderAnimation && !isFocused && value.length === 0;

  const stopAnim = useCallback(() => {
    activeRef.current = false;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
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

    if (reducedMotion) {
      stopAnim();

      const m = machineRef.current;
      m.charIndex = 0;
      m.phase = "typing";
      m.placeholder = "Ask anything";
      m.swapFade = false;
      m.nextAt = 0;

      setCharIndex(0);
      setPhase("typing");
      setPlaceholder("Ask anything");
      setSwapFade(false);
    }
  }, [reducedMotion, showGhost, stopAnim]);

  useEffect(() => {
    if (!showGhost) {
      stopAnim();
      return;
    }

    if (reducedMotion) {
      stopAnim();
      return;
    }

    if (!pageVisible || !inView) {
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

    const jitter = (base, amt) =>
      Math.max(0, Math.round(base + (Math.random() * 2 - 1) * amt));

    const extraDelayForChar = (ch) => {
      if (!ch) return 0;
      if (/[.,!?]/.test(ch)) return 90;
      if (ch === " ") return 10;
      return 0;
    };

    const step = (ts) => {
      if (!activeRef.current) return;

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

            m.nextAt = now + jitter(TYPE_BASE, TYPE_JITTER) + extraDelayForChar(nextChar);
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

      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);

    return () => stopAnim();

  }, [showGhost, reducedMotion, pageVisible, inView, stopAnim]);

  const handleFocus = () => {
    setIsFocused(true);
  }

  const handleBlur = () => {
    setIsFocused(false);
  }

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  }

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    addFiles(e.dataTransfer.files);
  }

  const handleRemoveFile = (fileToRemove) => {
    setFiles((prev) => prev.filter((f) => f.id !== fileToRemove.id));
  }

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    if (isGenerating) return;

    const uploadFn = onUpload || uploadMaterialSet;
    let filesToUpload = disableUploads ? [] : files.map((f) => f.file).filter(Boolean);

    if (!isCancelMode && !value.trim() && filesToUpload.length === 0) {
      return;
    }

    if (filesToUpload.length > 0) {
      if (!uploadFn) return;
    }

    setIsGenerating(true);

    let nextJobId = null;
    let nextThreadId = null;

    if (filesToUpload.length > 0) {
      console.log(
        "[AnimatedChatbar] Uploading files:",
        filesToUpload.map((f) => f.name),
      );
      try {
        const res = await uploadFn(filesToUpload);
        nextJobId = res?.job_id ?? res?.jobId ?? null;
        nextThreadId = res?.thread_id ?? res?.threadId ?? null;
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

  const addFiles = (incoming) => {
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
  }

  const handleFileInputChange = (e) => {
    addFiles(e.target.files);
    e.target.value = "";
  }

  const ghostClass = showGhost
    ? (swapFade ? "opacity-0 translate-y-0" : "opacity-100 translate-y-0")
    : "opacity-0 translate-y-1";

  return (
    <form
      ref={rootRef}
      onSubmit={handleSubmit}
      className={cn("w-full max-w-4xl mx-auto px-4 sm:px-6", className)}
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
          `
          relative bg-background border border-border rounded-3xl px-3
          sm:px-4 sm:px-4 py-3 sm:py-3.5 shadow-sm transition-shadow
          hover:shadow-md focus-within:shadow-md`,
          isDragging && !disableUploads && "ring-2 ring-primary/40 ring-offset-2 ring-offset-background"
        )}
        onDragEnter={disableUploads ? undefined : handleDragEnter}
        onDragLeave={disableUploads ? undefined : handleDragLeave}
        onDragOver={disableUploads ? undefined : handleDragOver}
        onDrop={disableUploads ? undefined : handleDrop}
      >
        {!disableUploads && files.length > 0 && (
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

            {canScrollLeft && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute left-0 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-background/80 backdrop-blur-sm shadow-sm border border-border"
                aria-label="Scroll files left"
                onClick={() => scrollFilesBy(-1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            )}

            {canScrollRight && (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-background/80 backdrop-blur-sm shadow-sm border border-border"
                  aria-label="Scroll files right"
                  onClick={() => scrollFilesBy(1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-background to-transparent" />
              </>
            )}
          </div>
        )}
        <div className="flex items-center gap-2 sm:gap-3">
          {!disableUploads && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 sm:h-9 rounded-full shrink-0 hover:bg-muted"
              aria-label="Attach file"
              onClick={() => fileInputRef.current?.click()}
            >
              <Plus className="h-5 w-5 sm:h-5 sm:w-5" />
            </Button>
          )}
          <div className="relative flex-1 min-w-0">
            <div
              aria-hidden="true"
              className={cn(
                "pointer-events-none absolute inset-y-0 left-0 right-0 flex items-center px-3 transition-all duration-200 ease-out transform-gpu",
                ghostClass
              )}
            >
              <div className="relative flex min-w-0 items-center">
                <span className="truncate text-sm sm:text-base text-muted-foreground">
                  {placeholder}
                </span>
                <span
                  className={cn(
                    "ml-1 inline-block w-[2px] h-[1.05em] rounded-full bg-current align-[-0.125em]",
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
                <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-background to-transparent" />
              </div>
            </div>
            <Input
              ref={inputRef}
              type="text"
              value={value}
              disabled={isCancelMode || isGenerating}
              onChange={(e) => setValue(e.target.value)}
              onFocus={handleFocus}
              onBlur={handleBlur}
              placeholder={isCancelMode ? "Generating… press send to cancel" : "Ask anything"}
              aria-label="Chat input"
              className={cn(
                "w-full !bg-transparent text-sm sm:text-base text-foreground placeholder:text-muted-foreground",
                "border-0 outline-none",
                "shadow-none ring-0 ring-offset-0 ring-offset-transparent",
                "focus:shadow-none focus:ring-0 focus:ring-offset-0 focus:bg-transparent",
                "focus-visible:shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:bg-transparent",
                "[--tw-ring-color:transparent] [--tw-ring-offset-color:transparent]",
                "autofill:shadow-[inset_0_0_0px_1000px_transparent]",
                "autofill:text-fill-foreground",
                showGhost && "placeholder:opacity-0"
              )}
            />
          </div>
          <div
            className="flex items-center gap-1 sm:gap-2 shrink-0"
          >
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 sm:h-9 rounded-full hover:bg-muted"
              aria-label="Voice input"
            >
              <Mic className="h-4 w-4 sm:h-5 sm:w-5" />
            </Button>
            <Button
              type="submit"
              variant="ghost"
              size="icon"
              disabled={sendDisabled}
              className={cn(
                "h-8 w-8 sm:h-9 sm:w-9 rounded-full hover:bg-muted",
                sendDisabled && "text-muted-foreground/40 hover:bg-transparent"
              )}
              aria-label={isCancelMode ? "Cancel generation" : "Send message"}
            >
              {isGenerating || isCancelMode ? (
                <Square className="h-4 w-4 sm:h-4 sm:w-4 fill-current" />
              ) : (
                <ArrowUp className="h-4 w-4 sm:h-4 sm:w-4" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}





