import React, { useCallback, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Virtuoso } from "react-virtuoso";
import {
  MessageSquare,
  RotateCcw,
  ThumbsDown,
  ThumbsUp,
  Undo2,
} from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Separator } from "@/shared/ui/separator";
import { Skeleton } from "@/shared/ui/skeleton";
import { Textarea } from "@/shared/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";
import { cn } from "@/shared/lib/utils";
import { CodeBlock, InlineCode } from "@/shared/components/CodeBlock";
import { ImageLightbox } from "@/shared/components/ImageLightbox";
import { MermaidDiagram } from "@/shared/components/MermaidDiagram";
import katex from "katex";
import "katex/dist/katex.min.css";
import {
  attemptQuickCheck,
  type QuickCheckAttemptAction,
  type QuickCheckAttemptResult,
} from "@/shared/api/PathNodeService";
import type { JsonInput } from "@/shared/types/models";

interface DocBlock {
  id?: string;
  type?: string;
  md?: string;
  level?: number;
  text?: string;
  variant?: string;
  title?: string;
  language?: string;
  filename?: string;
  code?: string;
  asset?: { url?: string | null };
  caption?: string;
  url?: string;
  kind?: string;
  source?: string;
  columns?: unknown[];
  rows?: unknown[];
  items_md?: unknown[];
  steps_md?: unknown[];
  terms?: unknown[];
  qas?: unknown[];
  prompt_md?: string;
  answer_md?: string;
  [key: string]: unknown;
}

interface DocShape {
  summary?: string;
  blocks?: DocBlock[];
}

interface SectionItem {
  id: string;
  blocks: Array<{ b: DocBlock; i: number }>;
}

interface NodeDocRendererProps {
  doc?: JsonInput;
  pathNodeId?: string;
  pendingBlocks?: Record<string, boolean | string>;
  blockFeedback?: Record<string, string>;
  undoableBlocks?: Record<string, boolean>;
  onLike?: (block: DocBlock, index: number) => void;
  onDislike?: (block: DocBlock, index: number) => void;
  onRegenerate?: (block: DocBlock, index: number) => void;
  onChat?: (block: DocBlock, index: number) => void;
  onUndo?: (block: DocBlock, index: number) => void;
}

function normalizeDoc(doc: JsonInput | undefined): DocShape | null {
  if (!doc) return null;
  if (typeof doc === "object" && !Array.isArray(doc)) return doc as DocShape;
  if (typeof doc === "string") {
    try {
      const parsed = JSON.parse(doc);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as DocShape;
      }
      return null;
    } catch {
      return null;
    }
  }
  return null;
}

function asArray<T>(v: T[] | null | undefined): T[] {
  return Array.isArray(v) ? v : [];
}

function asUnknownArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function safeString(v: unknown) {
  return typeof v === "string" ? v : v == null ? "" : String(v);
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

const sectionLabelByType: Record<string, string> = {
  objectives: "Objectives",
  prerequisites: "Prerequisites",
  key_takeaways: "Key takeaways",
  glossary: "Glossary",
  common_mistakes: "Common mistakes",
  misconceptions: "Misconceptions",
  edge_cases: "Edge cases",
  heuristics: "Heuristics",
  steps: "Steps",
  checklist: "Checklist",
  faq: "FAQ",
  intuition: "Intuition",
  mental_model: "Mental model",
  why_it_matters: "Why it matters",
  connections: "Connections",
};

function toMarkdownBullets(items: string[]) {
  return items.map((it) => `- ${it}`).join("\n");
}

function toMarkdownNumbered(items: string[]) {
  return items.map((it, i) => `${i + 1}. ${it}`).join("\n");
}

function SectionBlock({
  label,
  title,
  children,
}: {
  label: string;
  title?: string;
  children: React.ReactNode;
}) {
  const t = safeString(title).trim();
  return (
    <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      {t ? <div className="mt-1 text-sm font-medium text-foreground">{t}</div> : null}
      <div className={cn("mt-3", t && "mt-2")}>{children}</div>
    </div>
  );
}

type SectionTone = "primary" | "accent";

const sectionToneStyles: Record<SectionTone, { glow: string; overlay: string }> = {
  primary: {
    glow: "bg-primary/6",
    overlay: "from-primary/6 via-background/85 to-transparent",
  },
  accent: {
    glow: "bg-accent/6",
    overlay: "from-accent/6 via-background/85 to-transparent",
  },
};

function SectionShell({
  tone = "primary",
  className,
  style,
  children,
}: {
  tone?: SectionTone;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  const toneStyle = sectionToneStyles[tone];
  return (
    <div style={style} className={cn("relative -mx-1 sm:-mx-3", className)}>
      <div
        className={cn(
          "pointer-events-none absolute -inset-4 sm:-inset-6 rounded-[32px] blur-2xl opacity-50 z-0",
          toneStyle.glow
        )}
      />
      <div className="relative z-10 rounded-[26px] border border-border/60 bg-background/90 p-6 sm:p-8 shadow-[0_12px_28px_-22px_rgba(15,23,42,0.25)]">
        <div className="pointer-events-none absolute inset-0 rounded-[26px] overflow-hidden z-0">
          <div className={cn("absolute inset-0 bg-gradient-to-br opacity-60", toneStyle.overlay)} />
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-foreground/10 to-transparent" />
        </div>
        <div className="relative z-10">{children}</div>
      </div>
    </div>
  );
}

const SectionList = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ style, className, ...props }, ref) => <div ref={ref} style={style} className={cn(className)} {...props} />
);

SectionList.displayName = "SectionList";

const BlockList = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ style, className, ...props }, ref) => <div ref={ref} style={style} className={cn(className)} {...props} />
);

BlockList.displayName = "BlockList";

function markdownComponents(): Components {
  return {
    p({ children }: { children?: React.ReactNode }) {
      return <p className="mt-4 first:mt-0 text-pretty leading-7 text-foreground/90">{children}</p>;
    },
    a({ href, children }: { href?: string; children?: React.ReactNode }) {
      return (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-4 hover:text-foreground"
        >
          {children}
        </a>
      );
    },
    pre({ children }: { children?: React.ReactNode }) {
      const child = React.Children.toArray(children)[0];
      if (React.isValidElement(child)) {
        const props = child.props as { className?: string; children?: React.ReactNode };
        const raw = String(props.children || "");
        const m = /language-([a-zA-Z0-9_-]+)/.exec(props.className || "");
        const lang = m?.[1] || "";
        return <CodeBlock language={lang}>{raw.replace(/\n$/, "")}</CodeBlock>;
      }
      return (
        <pre className="my-4 overflow-x-auto rounded-xl border border-border/60 bg-muted/20 p-4 text-sm">
          {children}
        </pre>
      );
    },
    code({ className, children }: { className?: string; children?: React.ReactNode }) {
      return <InlineCode className={className}>{children}</InlineCode>;
    },
    ul({ children }: { children?: React.ReactNode }) {
      return <ul className="mt-4 first:mt-0 list-disc ps-5 space-y-2 text-foreground/90">{children}</ul>;
    },
    ol({ children }: { children?: React.ReactNode }) {
      return <ol className="mt-4 first:mt-0 list-decimal ps-5 space-y-2 text-foreground/90">{children}</ol>;
    },
    li({ children }: { children?: React.ReactNode }) {
      return <li className="leading-relaxed">{children}</li>;
    },
    h2({ children }: { children?: React.ReactNode }) {
      return (
        <h2 className="mt-8 first:mt-0 text-balance text-2xl font-semibold tracking-tight text-foreground">
          {children}
        </h2>
      );
    },
    h3({ children }: { children?: React.ReactNode }) {
      return (
        <h3 className="mt-6 first:mt-0 text-balance text-xl font-semibold tracking-tight text-foreground">
          {children}
        </h3>
      );
    },
    h4({ children }: { children?: React.ReactNode }) {
      return (
        <h4 className="mt-5 first:mt-0 text-balance text-lg font-semibold tracking-tight text-foreground">
          {children}
        </h4>
      );
    },
    blockquote({ children }: { children?: React.ReactNode }) {
      return (
        <blockquote className="mt-4 first:mt-0 border-l-2 border-border/70 pl-4 text-foreground/85">
          {children}
        </blockquote>
      );
    },
    hr() {
      return <hr className="my-6 border-border/60" />;
    },
  };
}

function inlineMarkdownComponents(): Components {
  const base = markdownComponents();
  return {
    ...base,
    p({ children }: { children?: React.ReactNode }) {
      return <span className="leading-relaxed">{children}</span>;
    },
    pre({ children }: { children?: React.ReactNode }) {
      return <span>{children}</span>;
    },
    ul({ children }: { children?: React.ReactNode }) {
      return <span>{children}</span>;
    },
    ol({ children }: { children?: React.ReactNode }) {
      return <span>{children}</span>;
    },
  };
}

function toYouTubeEmbedURL(url: unknown) {
  const u = safeString(url).trim();
  if (!u) return null;
  try {
    const parsed = new URL(u);
    const host = parsed.hostname.toLowerCase();
    if (host === "youtu.be") {
      const id = parsed.pathname.replace("/", "");
      if (!id) return null;
      return `https://www.youtube.com/embed/${id}`;
    }
    if (host.endsWith("youtube.com")) {
      if (parsed.pathname === "/watch") {
        const id = parsed.searchParams.get("v");
        if (!id) return null;
        return `https://www.youtube.com/embed/${id}`;
      }
      if (parsed.pathname.startsWith("/embed/")) return u;
    }
    return null;
  } catch {
    return null;
  }
}

function isVideoURL(url: unknown) {
  const u = safeString(url).trim().toLowerCase();
  return u.endsWith(".mp4") || u.endsWith(".webm") || u.endsWith(".mov") || u.endsWith(".m4v");
}

function svgToDataURL(svg: unknown) {
  const s = safeString(svg).trim();
  if (!s) return null;
  if (!s.toLowerCase().includes("<svg")) return null;
  // Minimal hardening: strip script tags and on* handlers (best-effort).
  const stripped = s
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, "");
  return `data:image/svg+xml;utf8,${encodeURIComponent(stripped)}`;
}

function QuickCheck({
  pathNodeId,
  blockId,
  promptMd,
  answerMd,
  kind,
  options,
}: {
  pathNodeId?: string;
  blockId?: string;
  promptMd?: string;
  answerMd?: string;
  kind?: unknown;
  options?: unknown;
}) {
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<QuickCheckAttemptResult | null>(null);
  const [loadingAction, setLoadingAction] = useState<QuickCheckAttemptAction | null>(null);
  const [error, setError] = useState("");

  const choiceOptions = useMemo(() => {
    const arr = Array.isArray(options) ? options : [];
    const out: Array<{ id: string; text: string }> = [];
    const seen = new Set<string>();
    for (const x of arr) {
      if (!x || typeof x !== "object" || Array.isArray(x)) continue;
      const id = safeString((x as { id?: unknown }).id).trim();
      const text = safeString((x as { text?: unknown }).text).trim();
      if (!id || !text || seen.has(id)) continue;
      seen.add(id);
      out.push({ id, text });
    }
    return out;
  }, [options]);
  const kindNorm = safeString(kind).toLowerCase().trim();
  const isChoiceMode = choiceOptions.length > 0 || kindNorm === "mcq" || kindNorm === "true_false";

  const status = safeString(result?.status).toLowerCase();
  const statusMeta: { label: string; className: string } | null =
    status === "correct"
      ? { label: "Correct", className: "bg-emerald-500/10 text-emerald-700 border-emerald-600/20" }
      : status === "try_again"
        ? { label: "Try again", className: "bg-amber-500/10 text-amber-700 border-amber-600/20" }
        : status === "wrong"
          ? { label: "Wrong", className: "bg-rose-500/10 text-rose-700 border-rose-600/20" }
          : status === "hint"
            ? { label: "Hint", className: "bg-sky-500/10 text-sky-700 border-sky-600/20" }
            : null;

  const canUseBackend = Boolean(String(pathNodeId || "").trim() && String(blockId || "").trim());
  const isBusy = loadingAction !== null;

  const run = useCallback(
    async (action: QuickCheckAttemptAction) => {
      if (!canUseBackend) {
        setError("Interactive checks are unavailable (missing node or block id).");
        return;
      }
      if (action === "submit") {
        const a = answer.trim();
        if (!a) {
          setError(isChoiceMode ? "Select an option first." : "Type an answer first.");
          return;
        }
        if (isChoiceMode && choiceOptions.length > 0 && !choiceOptions.some((o) => o.id === a)) {
          setError("Select an option first.");
          return;
        }
      }

      setError("");
      setLoadingAction(action);
      const t0 =
        typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();

      try {
        const res = await attemptQuickCheck(String(pathNodeId), String(blockId), {
          action,
          answer,
          client_event_id: generateIdempotencyKey(),
          occurred_at: new Date().toISOString(),
          latency_ms: Math.max(
            0,
            Math.round(
              (typeof performance !== "undefined" && typeof performance.now === "function"
                ? performance.now()
                : Date.now()) - t0
            )
          ),
        });
        if (!res) throw new Error("Empty response");
        setResult(res);
      } catch (err) {
        setError(getErrorMessage(err, "Quick check failed."));
      } finally {
        setLoadingAction(null);
      }
    },
    [answer, blockId, canUseBackend, choiceOptions, isChoiceMode, pathNodeId]
  );

  return (
    <div className="rounded-2xl border border-border/60 bg-background/60 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Quick check</div>
        {statusMeta ? (
          <div className={cn("rounded-full border px-2 py-0.5 text-xs font-medium", statusMeta.className)}>
            {statusMeta.label}
          </div>
        ) : null}
      </div>

      <div className="mt-2 text-[16px] leading-7 text-foreground/90">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents()} skipHtml>
          {safeString(promptMd)}
        </ReactMarkdown>
      </div>

      <div className="mt-4 space-y-3">
        {isChoiceMode && choiceOptions.length > 0 ? (
          <div className="space-y-2">
            {choiceOptions.map((o) => {
              const selected = answer.trim() === o.id;
              return (
                <Button
                  key={o.id}
                  type="button"
                  variant={selected ? "secondary" : "outline"}
                  size="sm"
                  disabled={!canUseBackend || isBusy}
                  onClick={() => {
                    setAnswer(o.id);
                    setResult(null);
                    setError("");
                  }}
                  className={cn(
                    "h-auto w-full items-start justify-start gap-3 whitespace-normal rounded-xl px-3 py-2 text-left",
                    selected && "ring-1 ring-primary/20"
                  )}
                >
                  <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border/60 bg-background text-xs font-semibold">
                    {o.id}
                  </span>
                  <span className="text-sm text-foreground/90">{o.text}</span>
                </Button>
              );
            })}
          </div>
        ) : (
          <Textarea
            value={answer}
            onChange={(e) => {
              setAnswer(e.target.value);
              if (result) setResult(null);
            }}
            placeholder="Type your answer…"
            rows={3}
            className="min-h-[88px]"
            disabled={!canUseBackend || isBusy}
          />
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={!canUseBackend || isBusy || !answer.trim()}
            onClick={() => void run("submit")}
          >
            {loadingAction === "submit" ? "Checking…" : "Check answer"}
          </Button>
          <Button type="button" variant="ghost" disabled={!canUseBackend || isBusy} onClick={() => void run("hint")}>
            {loadingAction === "hint" ? "Getting hint…" : "Hint"}
          </Button>
        </div>

        {error ? <div className="text-xs text-destructive">{error}</div> : null}

        {safeString(result?.feedback_md).trim() ? (
          <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Feedback</div>
            <div dir="auto" className="mt-2 text-[15px] leading-7 text-foreground/90">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents()} skipHtml>
                {safeString(result?.feedback_md)}
              </ReactMarkdown>
            </div>
          </div>
        ) : null}

        {safeString(result?.hint_md).trim() ? (
          <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Hint</div>
            <div dir="auto" className="mt-2 text-[15px] leading-7 text-foreground/90">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents()} skipHtml>
                {safeString(result?.hint_md)}
              </ReactMarkdown>
            </div>
          </div>
        ) : null}
      </div>

      <details className="mt-4">
        <summary className="cursor-pointer text-sm font-medium text-foreground/90">Reveal answer</summary>
        <div className="mt-3 rounded-xl border border-border/60 bg-muted/20 p-3 text-[16px] leading-7 text-foreground/90">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents()} skipHtml>
            {safeString(answerMd)}
          </ReactMarkdown>
        </div>
      </details>
    </div>
  );
}

function ActionButton({
  label,
  shortcut,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  shortcut?: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-pressed={active}
          disabled={disabled}
          onClick={onClick}
          className={cn(
            "h-7 w-7 rounded-full text-muted-foreground transition",
            "hover:text-foreground hover:bg-accent",
            active && "bg-accent text-foreground shadow-sm",
            disabled && "opacity-60"
          )}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" shortcut={shortcut}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function BlockSkeleton({ type }: { type?: string }) {
  const pulse = "bg-muted/60 !animate-[pulse_2.4s_ease-in-out_infinite]";
  if (type === "heading") {
    return <Skeleton className={cn("h-6 w-2/3", pulse)} />;
  }
  if (type === "code") {
    return (
      <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-4">
        <Skeleton className={cn("h-4 w-32", pulse)} />
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className={cn("h-3 w-full", pulse)} />
          ))}
        </div>
      </div>
    );
  }
  if (type === "figure" || type === "video" || type === "diagram") {
    return (
      <div className="space-y-2">
        <Skeleton className={cn("h-[220px] w-full rounded-xl", pulse)} />
        <Skeleton className={cn("h-3 w-40", pulse)} />
      </div>
    );
  }
  if (type === "table") {
    return (
      <div className="space-y-2">
        <Skeleton className={cn("h-5 w-40", pulse)} />
        <div className="space-y-2 rounded-xl border border-border p-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className={cn("h-3 w-full", pulse)} />
          ))}
        </div>
      </div>
    );
  }
  if (type === "equation") {
    return (
      <div className="space-y-2">
        <Skeleton className={cn("h-10 w-2/3", pulse)} />
        <Skeleton className={cn("h-3 w-32", pulse)} />
      </div>
    );
  }
  if (type === "quick_check") {
    return (
      <div className="space-y-3 rounded-xl border border-border bg-background p-4">
        <Skeleton className={cn("h-3 w-24", pulse)} />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className={cn("h-3 w-full", pulse)} />
        ))}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className={cn("h-3 w-full", pulse)} />
      ))}
    </div>
  );
}

export function NodeDocRenderer({
  doc,
  pathNodeId,
  pendingBlocks = {},
  blockFeedback = {},
  undoableBlocks = {},
  onLike,
  onDislike,
  onRegenerate,
  onChat,
  onUndo,
}: NodeDocRendererProps) {
  const d = useMemo(() => normalizeDoc(doc), [doc]);
  const blocks = asArray<DocBlock>(d?.blocks);
  const [singleSectionHeight, setSingleSectionHeight] = useState(0);
  const [multiSectionHeight, setMultiSectionHeight] = useState(0);
  const sections = useMemo<SectionItem[]>(() => {
    const out: SectionItem[] = [];
    let current: SectionItem = {
      id: "intro",
      blocks: [],
    };

    for (let i = 0; i < blocks.length; i += 1) {
      const b = blocks[i];
      const type = safeString(b?.type).toLowerCase();
      const level = type === "heading" ? Number(b?.level || 2) : 0;
      if (type === "heading" && level === 2 && current.blocks.length > 0) {
        out.push(current);
        current = { id: safeString(b?.id) || `section:${i}`, blocks: [] };
      }
      current.blocks.push({ b, i });
    }
    if (current.blocks.length > 0) out.push(current);
    return out;
  }, [blocks]);

  const renderBlock = useCallback(
    (b: DocBlock, i: number, isLast = false) => {
      const type = safeString(b?.type).toLowerCase();
      const blockId = safeString(b?.id) || String(i);
      const isPending = Boolean(pendingBlocks?.[blockId]);
      const feedback = blockFeedback?.[blockId] || "";
      const undoAllowed = type !== "figure" && type !== "video";
      const canUndo = Boolean(undoableBlocks?.[blockId]) && undoAllowed;
      const showActions = Boolean(onLike || onDislike || onRegenerate || onChat || onUndo);
      const blockSpacing = !isLast ? "pb-10" : "";

      if (type === "divider") {
        return (
          <div
            key={blockId}
            data-doc-block-id={blockId}
            data-doc-block-index={i}
            data-doc-block-type={type}
            className={cn(blockSpacing)}
          >
            <Separator className="my-6" />
          </div>
        );
      }

      const actionBar = showActions ? (
        <div
          className={cn(
            "absolute -top-3 end-0 z-10 flex items-center gap-1 rounded-full border border-border/60",
            "bg-card/90 px-1.5 py-1 shadow-sm backdrop-blur",
            "opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
          )}
        >
          {onLike ? (
            <ActionButton
              label={feedback === "like" ? "Liked" : "Like"}
              shortcut="L"
              active={feedback === "like"}
              onClick={() => onLike?.(b, i)}
            >
              <ThumbsUp className="h-3.5 w-3.5" />
            </ActionButton>
          ) : null}
          {onDislike ? (
            <ActionButton
              label={feedback === "dislike" ? "Disliked" : "Dislike"}
              shortcut="D"
              active={feedback === "dislike"}
              onClick={() => onDislike?.(b, i)}
            >
              <ThumbsDown className="h-3.5 w-3.5" />
            </ActionButton>
          ) : null}
          {onRegenerate ? (
            <ActionButton
              label="Regenerate"
              shortcut="R"
              disabled={isPending}
              onClick={() => onRegenerate?.(b, i)}
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </ActionButton>
          ) : null}
          {onChat ? (
            <ActionButton label="Chat" shortcut="C" onClick={() => onChat?.(b, i)}>
              <MessageSquare className="h-3.5 w-3.5" />
            </ActionButton>
          ) : null}
          {onUndo && undoAllowed ? (
            <ActionButton
              label={canUndo ? "Undo" : "Undo (unavailable)"}
              shortcut="Cmd/Ctrl+Z"
              disabled={!canUndo || isPending}
              onClick={() => onUndo?.(b, i)}
            >
              <Undo2 className="h-3.5 w-3.5" />
            </ActionButton>
          ) : null}
        </div>
      ) : null;

      const wrap = (content: React.ReactNode) => (
        <div
          key={blockId}
          data-doc-block-id={blockId}
          data-doc-block-index={i}
          data-doc-block-type={type}
          className={cn("group relative", blockSpacing)}
        >
          {actionBar}
          {isPending ? (
            <div className="rounded-2xl border border-border/60 bg-muted/10 p-4">
              <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
                <span className="inline-flex h-2 w-2 rounded-full bg-primary/70 animate-pulse" />
                Regenerating this block
              </div>
              <BlockSkeleton type={type} />
            </div>
          ) : (
            content
          )}
        </div>
      );

      if (type === "heading") {
        const level = Number(b?.level || 2);
        const text = safeString(b?.text);
        if (level === 3) return wrap(<h3 className="text-balance text-xl font-semibold tracking-tight">{text}</h3>);
        if (level === 4) return wrap(<h4 className="text-balance text-lg font-semibold tracking-tight">{text}</h4>);
        return wrap(<h2 className="text-balance text-2xl font-semibold tracking-tight">{text}</h2>);
      }

      if (type === "paragraph") {
        return wrap(
          <div dir="auto" className="text-[16px] leading-7 text-foreground/90">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents()} skipHtml>
              {safeString(b?.md)}
            </ReactMarkdown>
          </div>
        );
      }

      if (type === "callout") {
        const variant = safeString(b?.variant).toLowerCase();
        const title = safeString(b?.title).trim();
        const border =
          variant === "warning"
            ? "border-warning/40 bg-warning/10"
            : variant === "tip"
              ? "border-success/40 bg-success/10"
              : "border-border/60 bg-muted/20";
        return wrap(
          <div className={cn("rounded-2xl border border-s-4 p-4", border)}>
            {title ? <div className="text-sm font-medium text-foreground">{title}</div> : null}
            <div dir="auto" className={cn("text-[16px] leading-7 text-foreground/90", title && "mt-2")}>
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents()} skipHtml>
                {safeString(b?.md)}
              </ReactMarkdown>
            </div>
          </div>
        );
      }

      const sectionLabel = sectionLabelByType[type];

      if (
        sectionLabel &&
        [
          "objectives",
          "prerequisites",
          "key_takeaways",
          "common_mistakes",
          "misconceptions",
          "edge_cases",
          "heuristics",
          "connections",
        ].includes(type)
      ) {
        const title = safeString(b?.title).trim();
        const items = asUnknownArray(b?.items_md).map(safeString).map((s) => s.trim()).filter(Boolean);
        if (items.length === 0) return null;
        const md = toMarkdownBullets(items);
        return wrap(
          <SectionBlock label={sectionLabel} title={title}>
            <div dir="auto" className="text-[16px] leading-7 text-foreground/90">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents()} skipHtml>
                {md}
              </ReactMarkdown>
            </div>
          </SectionBlock>
        );
      }

      if (sectionLabel && type === "checklist") {
        const title = safeString(b?.title).trim();
        const items = asUnknownArray(b?.items_md).map(safeString).map((s) => s.trim()).filter(Boolean);
        if (items.length === 0) return null;
        return wrap(
          <SectionBlock label={sectionLabel} title={title}>
            <ul className="space-y-2">
              {items.map((it, idx) => (
                <li key={idx} className="flex items-start gap-2 text-[16px] leading-7 text-foreground/90">
                  <span className="mt-1 inline-flex h-4 w-4 shrink-0 rounded-[5px] border border-border/60 bg-background" />
                  <div dir="auto" className="min-w-0 flex-1">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents()} skipHtml>
                      {it}
                    </ReactMarkdown>
                  </div>
                </li>
              ))}
            </ul>
          </SectionBlock>
        );
      }

      if (sectionLabel && type === "steps") {
        const title = safeString(b?.title).trim();
        const stepsMd = asUnknownArray(b?.steps_md).map(safeString).map((s) => s.trim()).filter(Boolean);
        if (stepsMd.length === 0) return null;
        const md = toMarkdownNumbered(stepsMd);
        return wrap(
          <SectionBlock label={sectionLabel} title={title}>
            <div dir="auto" className="text-[16px] leading-7 text-foreground/90">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents()} skipHtml>
                {md}
              </ReactMarkdown>
            </div>
          </SectionBlock>
        );
      }

      if (sectionLabel && type === "glossary") {
        const title = safeString(b?.title).trim();
        const terms = asUnknownArray(b?.terms)
          .map((it) => {
            if (!it || typeof it !== "object" || Array.isArray(it)) return null;
            const term = safeString((it as { term?: unknown }).term).trim();
            const definition = safeString((it as { definition_md?: unknown }).definition_md).trim();
            if (!term || !definition) return null;
            return { term, definition };
          })
          .filter((it): it is { term: string; definition: string } => Boolean(it));
        if (terms.length === 0) return null;
        return wrap(
          <SectionBlock label={sectionLabel} title={title}>
            <div className="space-y-3">
              {terms.map((t, idx) => (
                <div key={idx} className="grid gap-2 sm:grid-cols-[160px,1fr]">
                  <div className="text-sm font-medium text-foreground/90">{t.term}</div>
                  <div dir="auto" className="text-[16px] leading-7 text-foreground/90">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents()} skipHtml>
                      {t.definition}
                    </ReactMarkdown>
                  </div>
                </div>
              ))}
            </div>
          </SectionBlock>
        );
      }

      if (sectionLabel && type === "faq") {
        const title = safeString(b?.title).trim();
        const qas = asUnknownArray(b?.qas)
          .map((it) => {
            if (!it || typeof it !== "object" || Array.isArray(it)) return null;
            const q = safeString((it as { question_md?: unknown }).question_md).trim();
            const a = safeString((it as { answer_md?: unknown }).answer_md).trim();
            if (!q || !a) return null;
            return { q, a };
          })
          .filter((it): it is { q: string; a: string } => Boolean(it));
        if (qas.length === 0) return null;
        return wrap(
          <SectionBlock label={sectionLabel} title={title}>
            <div className="space-y-2">
              {qas.map((qa, idx) => (
                <details key={idx} className="rounded-xl border border-border/60 bg-background/60 p-3">
                  <summary className="cursor-pointer text-sm font-medium text-foreground/90">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={inlineMarkdownComponents()} skipHtml>
                      {qa.q}
                    </ReactMarkdown>
                  </summary>
                  <div dir="auto" className="mt-3 text-[16px] leading-7 text-foreground/90">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents()} skipHtml>
                      {qa.a}
                    </ReactMarkdown>
                  </div>
                </details>
              ))}
            </div>
          </SectionBlock>
        );
      }

      if (sectionLabel && ["intuition", "mental_model", "why_it_matters"].includes(type)) {
        const title = safeString(b?.title).trim();
        const md = safeString(b?.md).trim();
        if (!md) return null;
        return wrap(
          <SectionBlock label={sectionLabel} title={title}>
            <div dir="auto" className="text-[16px] leading-7 text-foreground/90">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents()} skipHtml>
                {md}
              </ReactMarkdown>
            </div>
          </SectionBlock>
        );
      }

      if (type === "code") {
        const raw = safeString(b?.code).replace(/\n$/, "");
        const filename = safeString(b?.filename).trim();
        const language = safeString(b?.language).trim();
        return wrap(
          <CodeBlock filename={filename || undefined} language={language || undefined}>
            {raw}
          </CodeBlock>
        );
      }

      if (type === "figure") {
        const url = safeString(b?.asset?.url).trim();
        if (!url) return null;
        const caption = safeString(b?.caption).trim();
        return wrap(
          <ImageLightbox
            src={url}
            alt={caption || "Figure"}
            caption={caption}
            frameClassName="bg-muted/20"
          />
        );
      }

      if (type === "video") {
        const url = safeString(b?.url).trim();
        if (!url) return null;
        const caption = safeString(b?.caption).trim();
        const yt = toYouTubeEmbedURL(url);
        return wrap(
          <div className="space-y-2">
            {yt ? (
              <div className="overflow-hidden rounded-2xl border border-border/60 bg-muted/20">
                <div className="aspect-video w-full">
                  <iframe
                    title={caption || "Video"}
                    src={yt}
                    className="h-full w-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              </div>
            ) : isVideoURL(url) ? (
              <video className="w-full rounded-2xl border border-border/60" controls src={url} />
            ) : (
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="text-sm underline underline-offset-4 hover:text-foreground"
              >
                Open video
              </a>
            )}
            {caption ? <div className="text-xs text-muted-foreground">{caption}</div> : null}
          </div>
        );
      }

      if (type === "diagram") {
        const kind = safeString(b?.kind).toLowerCase();
        const caption = safeString(b?.caption).trim();
        if (kind === "svg") {
          const dataUrl = svgToDataURL(b?.source);
          if (!dataUrl) return null;
          return wrap(
            <ImageLightbox
              src={dataUrl}
              alt={caption || "Diagram"}
              caption={caption}
              frameClassName="bg-muted/20"
            />
          );
        }
        if (kind === "mermaid") {
          return wrap(
            <MermaidDiagram
              source={safeString(b?.source)}
              caption={caption}
              alt={caption || "Diagram"}
              frameClassName="bg-muted/20"
            />
          );
        }
        return wrap(
          <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Diagram</div>
            <pre className="mt-2 overflow-x-auto text-sm text-foreground/90">
              <code>{safeString(b?.source)}</code>
            </pre>
            {caption ? <div className="mt-2 text-xs text-muted-foreground">{caption}</div> : null}
          </div>
        );
      }

      if (type === "equation") {
        const latex = safeString(b?.latex).trim();
        if (!latex) return null;
        const caption = safeString(b?.caption).trim();
        const display = Boolean(b?.display);
        let html = "";
        try {
          html = katex.renderToString(latex, { displayMode: display, throwOnError: false });
        } catch {
          html = "";
        }
        return wrap(
          <div className="space-y-2 rounded-2xl border border-border/60 bg-muted/10 p-4">
            {html ? (
              <div
                className={cn("overflow-x-auto text-foreground/90", display ? "text-lg" : "text-base")}
                dangerouslySetInnerHTML={{ __html: html }}
              />
            ) : (
              <pre className="overflow-x-auto text-sm text-foreground/90">
                <code>{latex}</code>
              </pre>
            )}
            {caption ? <div className="text-xs text-muted-foreground">{caption}</div> : null}
          </div>
        );
      }

      if (type === "table") {
        const caption = safeString(b?.caption).trim();
        const columns = asArray(b?.columns).map(safeString).filter(Boolean);
        const rows = asUnknownArray(b?.rows).map((r) => asUnknownArray(r).map(safeString));
        if (columns.length === 0 || rows.length === 0) return null;
        return wrap(
          <div className="space-y-2">
            <div className="overflow-x-auto rounded-2xl border border-border/60">
              <table className="w-full text-sm">
                <thead className="bg-muted/30">
                  <tr>
                    {columns.map((c, idx) => (
                      <th key={idx} className="px-3 py-2 text-start font-medium text-foreground/90">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, ridx) => (
                    <tr key={ridx} className="border-t border-border">
                      {columns.map((_, cidx) => (
                        <td key={cidx} className="px-3 py-2 text-foreground/80">
                          {safeString(r[cidx])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {caption ? <div className="text-xs text-muted-foreground">{caption}</div> : null}
          </div>
        );
      }

      if (type === "quick_check") {
        return wrap(
          <QuickCheck
            pathNodeId={pathNodeId}
            blockId={blockId}
            promptMd={b?.prompt_md}
            answerMd={b?.answer_md}
            kind={b?.kind}
            options={b?.options}
          />
        );
      }

      return null;
    },
    [blockFeedback, onChat, onDislike, onLike, onRegenerate, onUndo, pathNodeId, pendingBlocks, undoableBlocks]
  );

  const renderSection = useCallback(
    (index: number, s: SectionItem) => {
      const isLastSection = index === sections.length - 1;
      return (
        <div className={cn(!isLastSection && "pb-10 sm:pb-12")}>
          <SectionShell tone={index % 2 === 0 ? "primary" : "accent"}>
            <div>
              {s.blocks.map(({ b, i }, idx) => renderBlock(b, i, idx === s.blocks.length - 1))}
            </div>
          </SectionShell>
        </div>
      );
    },
    [renderBlock, sections.length]
  );
  const isSingleSection = sections.length === 1;
  React.useEffect(() => {
    if (!isSingleSection) return;
    setSingleSectionHeight(0);
  }, [isSingleSection, blocks.length]);
  React.useEffect(() => {
    if (isSingleSection) return;
    setMultiSectionHeight(0);
  }, [isSingleSection, sections.length]);

  if (!d || blocks.length === 0) {
    return <div className="text-sm text-muted-foreground">No unit doc yet.</div>;
  }

  return (
    <div className="relative mx-auto w-full max-w-5xl space-y-10 sm:space-y-12">
      {safeString(d?.summary).trim() ? (
        <div className="relative rounded-[26px] border border-border/60 bg-background/90 p-6 sm:p-8 shadow-[0_12px_28px_-22px_rgba(15,23,42,0.25)]">
          <div className="pointer-events-none absolute inset-0 rounded-[26px] overflow-hidden z-0">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/6 via-background/85 to-transparent opacity-60" />
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-foreground/10 to-transparent" />
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-primary/70" />
              Summary
            </div>
            <div dir="auto" className="mt-4 text-[16px] leading-7 text-foreground/90">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents()} skipHtml>
                {safeString(d.summary)}
              </ReactMarkdown>
            </div>
          </div>
        </div>
      ) : null}

      {isSingleSection ? (
        <SectionShell
          tone="primary"
          style={singleSectionHeight > 0 ? { minHeight: singleSectionHeight } : undefined}
        >
          <Virtuoso
            data={sections[0]?.blocks ?? []}
            useWindowScroll
            components={{ List: BlockList }}
            computeItemKey={(index, item) => safeString(item?.b?.id) || `block:${item?.i ?? index}`}
            itemContent={(index, item) =>
              renderBlock(item.b, item.i, index === (sections[0]?.blocks.length ?? 0) - 1)
            }
            totalListHeightChanged={setSingleSectionHeight}
          />
        </SectionShell>
      ) : (
        <div style={multiSectionHeight > 0 ? { minHeight: multiSectionHeight } : undefined}>
          <Virtuoso
            data={sections}
            useWindowScroll
            components={{ List: SectionList }}
            computeItemKey={(index, item) => item.id || `section:${index}`}
            itemContent={renderSection}
            totalListHeightChanged={setMultiSectionHeight}
          />
        </div>
      )}
    </div>
  );
}
