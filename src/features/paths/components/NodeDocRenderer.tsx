import React, { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";
import { cn } from "@/shared/lib/utils";
import { CodeBlock, InlineCode } from "@/shared/components/CodeBlock";
import { ImageLightbox } from "@/shared/components/ImageLightbox";
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

interface NodeDocRendererProps {
  doc?: JsonInput;
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

function markdownComponents(): Components {
  return {
    p({ children }: { children?: React.ReactNode }) {
      return <p className="text-pretty leading-relaxed text-foreground/90">{children}</p>;
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
      if (inline) return <InlineCode>{raw}</InlineCode>;
      return <CodeBlock language={lang}>{raw.replace(/\n$/, "")}</CodeBlock>;
    },
    ul({ children }: { children?: React.ReactNode }) {
      return <ul className="list-disc ps-5 space-y-2 text-foreground/90">{children}</ul>;
    },
    ol({ children }: { children?: React.ReactNode }) {
      return <ol className="list-decimal ps-5 space-y-2 text-foreground/90">{children}</ol>;
    },
    li({ children }: { children?: React.ReactNode }) {
      return <li className="leading-relaxed">{children}</li>;
    },
    h2({ children }: { children?: React.ReactNode }) {
      return <h2 className="text-balance text-xl font-semibold tracking-tight text-foreground">{children}</h2>;
    },
    h3({ children }: { children?: React.ReactNode }) {
      return <h3 className="text-balance text-lg font-semibold tracking-tight text-foreground">{children}</h3>;
    },
    h4({ children }: { children?: React.ReactNode }) {
      return <h4 className="text-balance text-base font-semibold tracking-tight text-foreground">{children}</h4>;
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

function QuickCheck({ promptMd, answerMd }: { promptMd?: string; answerMd?: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-background/60 p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Quick check</div>
      <div className="mt-2 text-[15px] leading-relaxed text-foreground/90">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents()} skipHtml>
          {safeString(promptMd)}
        </ReactMarkdown>
      </div>
      <details className="mt-3">
        <summary className="cursor-pointer text-sm font-medium text-foreground/90">
          Reveal answer
        </summary>
        <div className="mt-3 rounded-xl border border-border/60 bg-muted/20 p-3 text-[15px] leading-relaxed text-foreground/90">
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

  if (!d || blocks.length === 0) {
    return <div className="text-sm text-muted-foreground">No unit doc yet.</div>;
  }

  return (
    <div className="space-y-8">
      {safeString(d?.summary).trim() ? (
        <div className="rounded-2xl border border-border/60 bg-muted/20 p-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Summary</div>
          <div dir="auto" className="mt-3 text-[15px] leading-relaxed text-foreground/90">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents()} skipHtml>
              {safeString(d.summary)}
            </ReactMarkdown>
          </div>
        </div>
      ) : null}

      {blocks.map((b, i) => {
        const type = safeString(b?.type).toLowerCase();
        const blockId = safeString(b?.id) || String(i);
        const isPending = Boolean(pendingBlocks?.[blockId]);
        const feedback = blockFeedback?.[blockId] || "";
        const undoAllowed = type !== "figure" && type !== "video";
        const canUndo = Boolean(undoableBlocks?.[blockId]) && undoAllowed;
        const showActions = Boolean(onLike || onDislike || onRegenerate || onChat || onUndo);

        if (type === "divider") return <Separator key={i} className="my-6" />;

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
          <div key={blockId} className="group relative">
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
          if (level === 3) return wrap(<h3 className="text-balance text-lg font-semibold tracking-tight">{text}</h3>);
          if (level === 4) return wrap(<h4 className="text-balance text-base font-semibold tracking-tight">{text}</h4>);
          return wrap(<h2 className="text-balance text-xl font-semibold tracking-tight">{text}</h2>);
        }

        if (type === "paragraph") {
          return wrap(
            <div dir="auto" className="text-[15px] leading-relaxed text-foreground/90">
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
              <div dir="auto" className={cn("text-[15px] leading-relaxed text-foreground/90", title && "mt-2")}>
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
              <div dir="auto" className="text-[15px] leading-relaxed text-foreground/90">
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
                  <li key={idx} className="flex items-start gap-2 text-[15px] leading-relaxed text-foreground/90">
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
              <div dir="auto" className="text-[15px] leading-relaxed text-foreground/90">
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
                    <div dir="auto" className="text-[15px] leading-relaxed text-foreground/90">
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
                    <div dir="auto" className="mt-3 text-[15px] leading-relaxed text-foreground/90">
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
              <div dir="auto" className="text-[15px] leading-relaxed text-foreground/90">
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
          return wrap(<QuickCheck promptMd={b?.prompt_md} answerMd={b?.answer_md} />);
        }

        return null;
      })}
    </div>
  );
}
