import React, { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  MessageSquare,
  RotateCcw,
  ThumbsDown,
  ThumbsUp,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

function normalizeDoc(doc) {
  if (!doc) return null;
  if (typeof doc === "object") return doc;
  if (typeof doc === "string") {
    try {
      return JSON.parse(doc);
    } catch {
      return null;
    }
  }
  return null;
}

function asArray(v) {
  return Array.isArray(v) ? v : [];
}

function safeString(v) {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function markdownComponents() {
  return {
    p({ children }) {
      return <p className="leading-relaxed text-foreground/90">{children}</p>;
    },
    a({ href, children }) {
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
    code({ inline, children }) {
      if (inline) {
        return (
          <code className="rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[0.9em] text-foreground">
            {children}
          </code>
        );
      }
      return (
        <pre className="overflow-x-auto rounded-xl border border-border bg-muted/30 p-4 text-sm">
          <code>{children}</code>
        </pre>
      );
    },
    ul({ children }) {
      return <ul className="list-disc pl-5 space-y-1 text-foreground/90">{children}</ul>;
    },
    ol({ children }) {
      return <ol className="list-decimal pl-5 space-y-1 text-foreground/90">{children}</ol>;
    },
    li({ children }) {
      return <li className="leading-relaxed">{children}</li>;
    },
    h2({ children }) {
      return <h2 className="text-xl font-semibold tracking-tight text-foreground">{children}</h2>;
    },
    h3({ children }) {
      return <h3 className="text-lg font-semibold tracking-tight text-foreground">{children}</h3>;
    },
    h4({ children }) {
      return <h4 className="text-base font-semibold tracking-tight text-foreground">{children}</h4>;
    },
  };
}

function toYouTubeEmbedURL(url) {
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

function isVideoURL(url) {
  const u = safeString(url).trim().toLowerCase();
  return u.endsWith(".mp4") || u.endsWith(".webm") || u.endsWith(".mov") || u.endsWith(".m4v");
}

function svgToDataURL(svg) {
  const s = safeString(svg).trim();
  if (!s) return null;
  if (!s.toLowerCase().includes("<svg")) return null;
  // Minimal hardening: strip script tags and on* handlers (best-effort).
  const stripped = s
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, "");
  return `data:image/svg+xml;utf8,${encodeURIComponent(stripped)}`;
}

function CodeBlock({ language, filename, code }) {
  const [copied, setCopied] = useState(false);
  const hasHeader = Boolean(safeString(language).trim() || safeString(filename).trim());

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(String(code ?? ""));
      setCopied(true);
      setTimeout(() => setCopied(false), 900);
    } catch {
      // no-op
    }
  };

  return (
    <div className="rounded-xl border border-border bg-muted/20">
      {hasHeader ? (
        <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
          <div className="min-w-0 text-xs text-muted-foreground">
            <span className="font-medium text-foreground/80">{safeString(filename).trim() || "Code"}</span>
            {safeString(language).trim() ? <span className="ml-2">{safeString(language).trim()}</span> : null}
          </div>
          <Button variant="ghost" size="sm" onClick={copy}>
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      ) : null}
      <pre className={cn("overflow-x-auto p-4 text-sm", !hasHeader && "rounded-xl")}>
        <code>{safeString(code)}</code>
      </pre>
    </div>
  );
}

function QuickCheck({ promptMd, answerMd }) {
  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <div className="text-xs font-medium text-muted-foreground">Quick check</div>
      <div className="mt-2 text-[15px] leading-relaxed text-foreground/90">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents()} skipHtml>
          {safeString(promptMd)}
        </ReactMarkdown>
      </div>
      <details className="mt-3">
        <summary className="cursor-pointer text-sm font-medium text-foreground/90">
          Reveal answer
        </summary>
        <div className="mt-3 rounded-lg border border-border bg-muted/20 p-3 text-[15px] leading-relaxed text-foreground/90">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents()} skipHtml>
            {safeString(answerMd)}
          </ReactMarkdown>
        </div>
      </details>
    </div>
  );
}

function ActionButton({ label, active, disabled, onClick, children }) {
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
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

function BlockSkeleton({ type }) {
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
}) {
  const d = useMemo(() => normalizeDoc(doc), [doc]);
  const blocks = asArray(d?.blocks);

  if (!d || blocks.length === 0) {
    return <div className="text-sm text-muted-foreground">No unit doc yet.</div>;
  }

  return (
    <div className="space-y-6">
      {safeString(d?.summary).trim() ? (
        <div className="rounded-xl border border-border bg-muted/20 p-4">
          <div className="text-xs font-medium text-muted-foreground">Summary</div>
          <div className="mt-2 text-[15px] leading-relaxed text-foreground/90">
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
              "absolute -top-3 right-0 z-10 flex items-center gap-1 rounded-full border border-border",
              "bg-background/90 px-1.5 py-1 shadow-sm backdrop-blur",
              "opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
            )}
          >
            {onLike ? (
              <ActionButton
                label={feedback === "like" ? "Liked" : "Like"}
                active={feedback === "like"}
                onClick={() => onLike?.(b, i)}
              >
                <ThumbsUp className="h-3.5 w-3.5" />
              </ActionButton>
            ) : null}
            {onDislike ? (
              <ActionButton
                label={feedback === "dislike" ? "Disliked" : "Dislike"}
                active={feedback === "dislike"}
                onClick={() => onDislike?.(b, i)}
              >
                <ThumbsDown className="h-3.5 w-3.5" />
              </ActionButton>
            ) : null}
            {onRegenerate ? (
              <ActionButton
                label="Regenerate"
                disabled={isPending}
                onClick={() => onRegenerate?.(b, i)}
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </ActionButton>
            ) : null}
            {onChat ? (
              <ActionButton label="Chat" onClick={() => onChat?.(b, i)}>
                <MessageSquare className="h-3.5 w-3.5" />
              </ActionButton>
            ) : null}
            {onUndo && undoAllowed ? (
              <ActionButton
                label={canUndo ? "Undo" : "Undo (unavailable)"}
                disabled={!canUndo || isPending}
                onClick={() => onUndo?.(b, i)}
              >
                <Undo2 className="h-3.5 w-3.5" />
              </ActionButton>
            ) : null}
          </div>
        ) : null;

        const wrap = (content) => (
          <div key={blockId} className="group relative">
            {actionBar}
            {isPending ? (
              <div className="rounded-xl border border-border bg-muted/10 p-4">
                <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="inline-flex h-2 w-2 rounded-full bg-amber-500/70 animate-pulse" />
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
          if (level === 3) return wrap(<h3 className="text-lg font-semibold tracking-tight">{text}</h3>);
          if (level === 4) return wrap(<h4 className="text-base font-semibold tracking-tight">{text}</h4>);
          return wrap(<h2 className="text-xl font-semibold tracking-tight">{text}</h2>);
        }

        if (type === "paragraph") {
          return wrap(
            <div className="text-[15px] leading-relaxed text-foreground/90">
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
              ? "border-amber-500/40 bg-amber-500/5"
              : variant === "tip"
              ? "border-emerald-500/40 bg-emerald-500/5"
              : "border-border bg-muted/20";
          return wrap(
            <div className={cn("rounded-xl border p-4", border)}>
              {title ? <div className="text-sm font-medium text-foreground">{title}</div> : null}
              <div className={cn("text-[15px] leading-relaxed text-foreground/90", title && "mt-2")}>
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents()} skipHtml>
                  {safeString(b?.md)}
                </ReactMarkdown>
              </div>
            </div>
          );
        }

        if (type === "code") {
          return wrap(
            <CodeBlock
              language={b?.language}
              filename={b?.filename}
              code={b?.code}
            />
          );
        }

        if (type === "figure") {
          const url = safeString(b?.asset?.url).trim();
          if (!url) return null;
          const caption = safeString(b?.caption).trim();
          return wrap(
            <div className="space-y-2">
              <div className="overflow-hidden rounded-xl border border-border bg-muted/20">
                <img src={url} alt={caption || "Figure"} className="h-auto w-full" />
              </div>
              {caption ? <div className="text-xs text-muted-foreground">{caption}</div> : null}
            </div>
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
                <div className="overflow-hidden rounded-xl border border-border bg-muted/20">
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
                <video className="w-full rounded-xl border border-border" controls src={url} />
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
              <div className="space-y-2">
                <div className="overflow-hidden rounded-xl border border-border bg-muted/20">
                  <img src={dataUrl} alt={caption || "Diagram"} className="h-auto w-full" />
                </div>
                {caption ? <div className="text-xs text-muted-foreground">{caption}</div> : null}
              </div>
            );
          }
          return wrap(
            <div className="rounded-xl border border-border bg-muted/20 p-4">
              <div className="text-xs font-medium text-muted-foreground">Diagram</div>
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
          const rows = asArray(b?.rows).map((r) => asArray(r).map(safeString));
          if (columns.length === 0 || rows.length === 0) return null;
          return wrap(
            <div className="space-y-2">
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30">
                    <tr>
                      {columns.map((c, idx) => (
                        <th key={idx} className="px-3 py-2 text-left font-medium text-foreground/90">
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
