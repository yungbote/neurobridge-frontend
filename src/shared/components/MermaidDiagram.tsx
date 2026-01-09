import React, { useEffect, useMemo, useState } from "react";
import { useTheme } from "@/app/providers/ThemeProvider";
import { cn } from "@/shared/lib/utils";
import { Skeleton } from "@/shared/ui/skeleton";
import { ImageLightbox } from "@/shared/components/ImageLightbox";

type MermaidAPI = (typeof import("mermaid"))["default"];

let mermaidSingleton: MermaidAPI | null = null;
let mermaidImport: Promise<MermaidAPI> | null = null;

async function getMermaid(): Promise<MermaidAPI> {
  if (mermaidSingleton) return mermaidSingleton;
  if (!mermaidImport) {
    mermaidImport = import("mermaid").then((m) => m.default);
  }
  mermaidSingleton = await mermaidImport;
  return mermaidSingleton;
}

function safeString(v: unknown) {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function stripCodeFences(src: string) {
  const s = src.trim();
  if (!s.startsWith("```")) return s;
  const lines = s.split(/\r?\n/);
  if (lines.length < 2) return s;
  // Remove first fence line, and last fence line if present.
  const first = lines[0].trim();
  const last = lines[lines.length - 1].trim();
  const body = lines.slice(1, last === "```" ? -1 : undefined).join("\n");
  // If first fence is ```mermaid, drop the language tag too.
  if (first.startsWith("```")) return body.trim();
  return s;
}

function normalizeMermaidSource(raw: unknown) {
  let s = safeString(raw).trim();
  if (!s) return "";
  s = stripCodeFences(s);
  const lines = s.split(/\r?\n/);
  if (lines[0]?.trim().toLowerCase() === "diagram") {
    lines.shift();
  }
  return lines.join("\n").trim();
}

function svgToDataURL(svg: string) {
  const s = svg.trim();
  if (!s.toLowerCase().includes("<svg")) return null;
  // Minimal hardening: strip script tags and on* handlers (best-effort).
  const stripped = s
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, "");
  return `data:image/svg+xml;utf8,${encodeURIComponent(stripped)}`;
}

async function ensureMermaidInitialized(theme: "light" | "dark") {
  const mermaid = await getMermaid();
  // Mermaid config is global; keep it strict and deterministic.
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: theme === "dark" ? "dark" : "default",
    fontFamily: "inherit",
  });
}

async function renderMermaidDiagram(source: string, baseID: string, theme: "light" | "dark") {
  const mermaid = await getMermaid();
  await ensureMermaidInitialized(theme);

  // Best-effort robustness: if the model accidentally appends a caption to the source,
  // try progressively shorter prefixes until Mermaid parses.
  const lines = source.split(/\r?\n/).filter((l) => l.trim() !== "");
  const maxAttempts = Math.min(lines.length, 120);
  for (let n = maxAttempts; n >= 1; n--) {
    const candidate = lines.slice(0, n).join("\n").trim();
    if (!candidate) continue;
    try {
      const out = await mermaid.render(`${baseID}-${n}`, candidate);
      // mermaid.render can return either a string or an object depending on version.
      if (typeof out === "string") return out;
      if (out && typeof out === "object" && "svg" in out) {
        return String((out as { svg?: unknown }).svg || "");
      }
    } catch {
      // keep trying shorter
    }
  }
  throw new Error("mermaid render failed");
}

export function MermaidDiagram({
  source,
  caption,
  alt,
  className,
  frameClassName,
}: {
  source: string;
  caption?: string;
  alt?: string;
  className?: string;
  frameClassName?: string;
}) {
  const { effectiveTheme } = useTheme();
  const normalized = useMemo(() => normalizeMermaidSource(source), [source]);
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const renderID = useMemo(
    () => `mmd-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`,
    []
  );

  useEffect(() => {
    let canceled = false;
    setSvg(null);
    setError(null);
    if (!normalized) return;

    void (async () => {
      try {
        const out = await renderMermaidDiagram(normalized, renderID, effectiveTheme);
        if (canceled) return;
        setSvg(out);
      } catch (e) {
        if (canceled) return;
        setError(e instanceof Error ? e.message : "Failed to render diagram");
      }
    })();

    return () => {
      canceled = true;
    };
  }, [normalized, renderID, effectiveTheme]);

  if (!normalized) return null;

  if (!svg && !error) {
    return (
      <div className={cn("space-y-2", className)}>
        <Skeleton className="h-[220px] w-full rounded-2xl bg-muted/60 !animate-[pulse_2.4s_ease-in-out_infinite]" />
        {caption ? (
          <Skeleton className="h-3 w-44 bg-muted/60 !animate-[pulse_2.4s_ease-in-out_infinite]" />
        ) : null}
      </div>
    );
  }

  if (svg) {
    const dataUrl = svgToDataURL(svg);
    if (dataUrl) {
      return (
        <ImageLightbox
          src={dataUrl}
          alt={alt || caption || "Diagram"}
          caption={caption}
          className={className}
          frameClassName={frameClassName}
        />
      );
    }
  }

  // Fallback: show raw source when rendering fails.
  return (
    <div className={cn("rounded-2xl border border-border/60 bg-muted/20 p-4", className)}>
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Diagram{error ? " (render failed)" : ""}
      </div>
      <pre className="mt-2 overflow-x-auto text-sm text-foreground/90">
        <code>{normalized}</code>
      </pre>
      {caption ? <div className="mt-2 text-xs text-muted-foreground">{caption}</div> : null}
    </div>
  );
}
