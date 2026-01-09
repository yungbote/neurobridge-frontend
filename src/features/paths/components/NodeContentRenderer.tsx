import React, { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Separator } from "@/shared/ui/separator";
import { CodeBlock, InlineCode } from "@/shared/components/CodeBlock";
import { ImageLightbox } from "@/shared/components/ImageLightbox";
import { MermaidDiagram } from "@/shared/components/MermaidDiagram";
import type { JsonInput } from "@/shared/types/models";

interface ContentBlock {
  kind?: string;
  content_md?: string;
  items?: unknown[];
  asset_refs?: unknown[];
  url?: string;
}

interface ContentDoc {
  blocks?: ContentBlock[];
}

function safeString(v: unknown) {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function asArray<T>(v: T[] | null | undefined): T[] {
  return Array.isArray(v) ? v : [];
}

function normalizeContent(contentJson: JsonInput | undefined): ContentDoc | null {
  if (!contentJson) return null;
  if (typeof contentJson === "object" && !Array.isArray(contentJson)) return contentJson as ContentDoc;
  if (typeof contentJson === "string") {
    try {
      const parsed = JSON.parse(contentJson);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as ContentDoc;
      }
      return null;
    } catch {
      return null;
    }
  }
  return null;
}

function markdownComponents({ compact = false }: { compact?: boolean } = {}): Components {
  return {
    p({ children }: { children?: React.ReactNode }) {
      if (compact) return <span>{children}</span>;
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
    h1({ children }: { children?: React.ReactNode }) {
      return <h1 className="text-balance text-2xl font-semibold tracking-tight text-foreground">{children}</h1>;
    },
    h2({ children }: { children?: React.ReactNode }) {
      return <h2 className="text-balance text-xl font-semibold tracking-tight text-foreground">{children}</h2>;
    },
    h3({ children }: { children?: React.ReactNode }) {
      return <h3 className="text-balance text-lg font-semibold tracking-tight text-foreground">{children}</h3>;
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

function isProbablyImageURL(url: unknown) {
  const u = safeString(url).trim().toLowerCase();
  if (!u) return false;
  if (u.startsWith("data:image/")) return true;
  if (u.startsWith("http://") || u.startsWith("https://")) {
    return (
      u.endsWith(".png") ||
      u.endsWith(".jpg") ||
      u.endsWith(".jpeg") ||
      u.endsWith(".webp") ||
      u.endsWith(".gif") ||
      u.endsWith(".svg")
    );
  }
  return false;
}

function isVideoURL(url: unknown) {
  const u = safeString(url).trim().toLowerCase();
  return (
    u.endsWith(".mp4") ||
    u.endsWith(".webm") ||
    u.endsWith(".mov") ||
    u.endsWith(".m4v")
  );
}

interface NodeContentRendererProps {
  contentJson?: JsonInput;
}

export function NodeContentRenderer({ contentJson }: NodeContentRendererProps) {
  const content = useMemo(() => normalizeContent(contentJson), [contentJson]);
  const blocks = asArray(content?.blocks);

  if (!content || blocks.length === 0) {
    return <div className="text-sm text-muted-foreground">No content yet.</div>;
  }

  return (
    <div className="space-y-8">
      {blocks.map((b, i) => {
        const kind = safeString(b?.kind).toLowerCase();
        const md = safeString(b?.content_md);
        const items = asArray(b?.items).map((x) => safeString(x)).filter(Boolean);
        const assetRefs = asArray(b?.asset_refs).map((x) => safeString(x)).filter(Boolean);

        if (kind === "divider") {
          return <Separator key={i} className="my-6" />;
        }

        if (kind === "heading") {
          return (
            <h2 key={i} className="text-balance text-xl font-semibold tracking-tight text-foreground">
              {md}
            </h2>
          );
        }

        if (kind === "paragraph") {
          return (
            <div key={i} dir="auto" className="text-[15px] leading-relaxed text-foreground/90">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents()}>
                {md}
              </ReactMarkdown>
            </div>
          );
        }

        if (kind === "callout") {
          return (
            <div key={i} className="rounded-2xl border border-border/60 bg-muted/20 p-4">
              <div dir="auto" className="text-[15px] leading-relaxed text-foreground/90">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents()}>
                  {md}
                </ReactMarkdown>
              </div>
            </div>
          );
        }

        if (kind === "bullets") {
          return (
            <ul key={i} className="list-disc ps-5 space-y-2">
              {items.map((it, idx) => (
                <li key={idx} className="text-[15px] leading-relaxed text-foreground/90">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents({ compact: true })}>
                    {it}
                  </ReactMarkdown>
                </li>
              ))}
            </ul>
          );
        }

        if (kind === "steps") {
          return (
            <ol key={i} className="list-decimal ps-5 space-y-2">
              {items.map((it, idx) => (
                <li key={idx} className="text-[15px] leading-relaxed text-foreground/90">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents({ compact: true })}>
                    {it}
                  </ReactMarkdown>
                </li>
              ))}
            </ol>
          );
        }

        if (kind === "image") {
          const url = assetRefs[0] || "";
          if (!url) return null;
          return (
            <div key={i}>
              <ImageLightbox
                src={url}
                alt={md || "Content image"}
                caption={md}
                frameClassName="bg-muted/20"
              />
            </div>
          );
        }

        if (kind === "video_embed" || kind === "video") {
          const url = assetRefs[0] || safeString(b?.url).trim();
          if (!url) return null;
          const yt = toYouTubeEmbedURL(url);
          return (
            <div key={i} className="space-y-2">
              {yt ? (
                <div className="overflow-hidden rounded-2xl border border-border/60 bg-muted/20">
                  <div className="aspect-video w-full">
                    <iframe
                      title={md || "Video"}
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
              {md ? <div className="text-xs text-muted-foreground">{md}</div> : null}
            </div>
          );
        }

        if (kind === "diagram") {
          const ref = assetRefs[0] || "";
          if (ref && isProbablyImageURL(ref)) {
            return (
              <div key={i}>
                <ImageLightbox
                  src={ref}
                  alt={md || "Diagram"}
                  caption={md}
                  frameClassName="bg-muted/20"
                />
              </div>
            );
          }
          return (
            <div key={i}>
              <MermaidDiagram source={md} frameClassName="bg-muted/20" />
            </div>
          );
        }

        // Unknown block kind: best-effort render markdown.
        if (md) {
          return (
            <div key={i} className="text-[15px] leading-relaxed text-foreground/90">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents()}>
                {md}
              </ReactMarkdown>
            </div>
          );
        }

        return null;
      })}
    </div>
  );
}
