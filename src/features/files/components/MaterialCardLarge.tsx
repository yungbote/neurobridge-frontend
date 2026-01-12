import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Ellipsis, File as FileIcon, FileText, Image as ImageIcon, Video } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/shared/ui/card";
import { Badge } from "@/shared/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import type { MaterialFile } from "@/shared/types/models";
import { getAccessToken } from "@/shared/services/StorageService";
import { cn } from "@/shared/lib/utils";
import { useI18n } from "@/app/providers/I18nProvider";
import { Skeleton, SkeletonPill, SkeletonText } from "@/shared/ui/skeleton";

interface MaterialCardLargeProps {
  file?: MaterialFile | null;
}

function splitFileNameExt(name: string): { base: string; ext: string } | null {
  const trimmed = String(name || "").trim();
  if (!trimmed) return null;
  const lastDot = trimmed.lastIndexOf(".");
  if (lastDot <= 0 || lastDot >= trimmed.length - 1) return null;
  const base = trimmed.slice(0, lastDot).trim();
  const ext = trimmed.slice(lastDot).trim();
  if (!base || !ext) return null;
  return { base, ext };
}

function formatBytes(v: unknown) {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  const idx = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  const value = n / Math.pow(1024, idx);
  return `${value.toFixed(value >= 10 || idx === 0 ? 0 : 1)} ${units[idx]}`;
}

function fileIcon(file: MaterialFile | null | undefined) {
  const name = String(file?.originalName || "").toLowerCase();
  const mime = String(file?.mimeType || "").toLowerCase();
  const ext = name.split(".").pop() || "";
  if (mime.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) {
    return ImageIcon;
  }
  if (mime.startsWith("video/") || ["mp4", "mov", "webm", "mkv"].includes(ext)) {
    return Video;
  }
  if (mime.includes("pdf") || ["pdf", "doc", "docx", "txt", "rtf"].includes(ext)) {
    return FileText;
  }
  return FileIcon;
}

function fileTypeLabel(file: MaterialFile | null | undefined) {
  const mime = String(file?.mimeType || "").toLowerCase();
  if (!mime) return "file";
  if (mime.includes("pdf")) return "pdf";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return mime;
}

function fileTypeBadgeLabel(file: MaterialFile | null | undefined) {
  const name = String(file?.originalName || "").toLowerCase();
  const mime = String(file?.mimeType || "").toLowerCase();
  const ext = name.split(".").pop() || "";

  if (mime.includes("pdf") || ext === "pdf") return "PDF";

  if (
    mime.includes("presentationml") ||
    mime.includes("powerpoint") ||
    ["ppt", "pptx", "pptm", "pps", "ppsx", "ppsm", "potx", "potm"].includes(ext)
  ) {
    return (ext || "pptx").toUpperCase();
  }

  if (
    mime.includes("wordprocessingml") ||
    ["doc", "docx", "docm", "dotx", "dotm"].includes(ext)
  ) {
    return (ext || "docx").toUpperCase();
  }

  if (mime.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) {
    return ext ? ext.toUpperCase() : "IMAGE";
  }
  if (mime.startsWith("video/") || ["mp4", "mov", "webm", "mkv"].includes(ext)) {
    return ext ? ext.toUpperCase() : "VIDEO";
  }
  if (mime.startsWith("audio/") || ["mp3", "wav", "m4a", "flac", "ogg", "opus"].includes(ext)) {
    return ext ? ext.toUpperCase() : "AUDIO";
  }
  if (mime.startsWith("text/") || ["txt", "md", "rtf", "csv", "log"].includes(ext)) {
    return ext ? ext.toUpperCase() : "TEXT";
  }

  if (ext) return ext.toUpperCase().slice(0, 8);
  if (mime && mime.includes("/")) return mime.split("/").pop()!.toUpperCase().slice(0, 8);
  return "FILE";
}

export function MaterialCardLarge({ file }: MaterialCardLargeProps) {
  const { t } = useI18n();
  const [thumbError, setThumbError] = useState(false);
  const [splitExtToSecondLine, setSplitExtToSecondLine] = useState(false);
  const titleWrapRef = useRef<HTMLDivElement | null>(null);
  const titleMeasureRef = useRef<HTMLDivElement | null>(null);

  const apiBase = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");
  const token = getAccessToken();

  useEffect(() => {
    setThumbError(false);
  }, [file?.id, file?.updatedAt]);

  const fileUrl = useMemo(() => {
    if (!file?.id) return "";
    const baseUrl = `${apiBase}/material-files/${file.id}/view`;
    return token ? `${baseUrl}?token=${encodeURIComponent(token)}` : baseUrl;
  }, [apiBase, file?.id, token]);

  const thumbUrl = useMemo(() => {
    if (!file?.id) return "";
    const baseUrl = `${apiBase}/material-files/${file.id}/thumbnail`;
    const url = token ? `${baseUrl}?token=${encodeURIComponent(token)}` : baseUrl;
    const version = file.updatedAt || file.createdAt || "";
    return version ? `${url}${url.includes("?") ? "&" : "?"}v=${encodeURIComponent(version)}` : url;
  }, [apiBase, file?.createdAt, file?.id, file?.updatedAt, token]);

  if (!file) return null;

  const titleText = file.originalName || t("common.untitledFile");
  const titleParts = useMemo(() => splitFileNameExt(titleText), [titleText]);
  const typeText = fileTypeLabel(file);
  const typeBadgeText = fileTypeBadgeLabel(file);
  const sizeText = file.sizeBytes ? formatBytes(file.sizeBytes) : "";
  const subText = [typeText, sizeText].filter(Boolean).join(" · ") || null;

  const Icon = fileIcon(file);
  const showThumb = Boolean(thumbUrl) && !thumbError;

  useLayoutEffect(() => {
    if (!titleParts) {
      setSplitExtToSecondLine(false);
      return;
    }
    const measureEl = titleMeasureRef.current;
    if (!measureEl) return;

    const cs = window.getComputedStyle(measureEl);
    let lineHeight = Number.parseFloat(cs.lineHeight);
    if (!Number.isFinite(lineHeight) || lineHeight <= 0) {
      const fontSize = Number.parseFloat(cs.fontSize);
      lineHeight = Number.isFinite(fontSize) && fontSize > 0 ? fontSize * 1.25 : 20;
    }
    const h = measureEl.getBoundingClientRect().height;
    const lines = lineHeight > 0 ? Math.round(h / lineHeight) : 1;
    setSplitExtToSecondLine(lines < 2);
  }, [titleParts, titleText]);

  useEffect(() => {
    const el = titleWrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      if (!titleParts) {
        setSplitExtToSecondLine(false);
        return;
      }
      const measureEl = titleMeasureRef.current;
      if (!measureEl) return;

      const cs = window.getComputedStyle(measureEl);
      let lineHeight = Number.parseFloat(cs.lineHeight);
      if (!Number.isFinite(lineHeight) || lineHeight <= 0) {
        const fontSize = Number.parseFloat(cs.fontSize);
        lineHeight = Number.isFinite(fontSize) && fontSize > 0 ? fontSize * 1.25 : 20;
      }
      const h = measureEl.getBoundingClientRect().height;
      const lines = lineHeight > 0 ? Math.round(h / lineHeight) : 1;
      setSplitExtToSecondLine(lines < 2);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [titleParts]);

  const titleNode = titleParts && splitExtToSecondLine ? (
    <>
      {titleParts.base}
      <span className="block">{titleParts.ext}</span>
    </>
  ) : (
    titleText
  );

  const card = (
    <Card className={cn(
      "group relative w-full",
      // Responsive max-width for small screens
      "max-w-[calc(100vw-2rem)] sm:max-w-[360px]",
      // Transitions and interactions
      "nb-motion-fast motion-reduce:transition-none",
      "hover:border-foreground/20 hover:shadow-md",
      // Touch interactions
      "active:scale-[0.99] touch-manipulation"
    )}>
      {/* Options button - always visible on mobile, hover on desktop */}
      <div className={cn(
        "absolute z-10",
        // Position - closer to edge on mobile
        "right-3 top-3 sm:right-4 sm:top-4",
        // Visibility - always visible on mobile, hover on desktop
        "opacity-100 sm:opacity-0",
        "transition-opacity nb-duration-micro nb-ease-out",
        "sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
      )}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                "inline-flex items-center justify-center rounded-full",
                "border border-border/60 bg-background/80 text-muted-foreground shadow-sm backdrop-blur-sm",
                // Touch-friendly sizing (44px on mobile, 36px on desktop)
                "h-11 w-11 sm:h-9 sm:w-9",
                // Transitions
                "nb-motion-fast motion-reduce:transition-none",
                // Hover/active states
                "hover:bg-muted/60 hover:text-foreground",
                "active:scale-95 active:bg-muted/80",
                // Focus
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30",
                // Touch optimizations
                "touch-manipulation -webkit-tap-highlight-color-transparent"
              )}
              aria-label={t("files.options")}
              title={t("common.options")}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              <Ellipsis className="h-5 w-5 sm:h-4 sm:w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={10} className="w-44">
            <DropdownMenuItem disabled onSelect={(e) => e.preventDefault()}>
              {t("common.moreActionsSoon")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <CardHeader>
        <div className="space-y-3">
          <div className="flex min-h-[110px] items-start justify-between gap-3">
            <div className="flex-1 space-y-1.5">
              <div className="flex items-center justify-start gap-2">
                <Badge>{t("common.file")}</Badge>
                <Badge variant="subtle">{typeBadgeText}</Badge>
              </div>
              <div ref={titleWrapRef} className="relative">
                <CardTitle className="line-clamp-2 text-balance text-lg leading-tight sm:text-xl">
                  {titleNode}
                </CardTitle>
                {titleParts ? (
                  <div
                    ref={titleMeasureRef}
                    aria-hidden="true"
                    className="pointer-events-none absolute left-0 top-0 invisible w-full whitespace-normal text-balance text-lg leading-tight sm:text-xl"
                  >
                    {titleText}
                  </div>
                ) : null}
              </div>

              {subText && (
                <div className="pt-1">
                  <div className="line-clamp-2 text-sm text-muted-foreground">
                    {subText}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-center">
            <div className={cn(
              "w-full overflow-hidden rounded-2xl border border-border/60 bg-muted/30 shadow-sm",
              // Responsive max-width
              "max-w-full sm:max-w-[320px]"
            )}>
              <div className="aspect-[16/9]">
                {showThumb ? (
                  <img
                    src={thumbUrl}
                    alt={t("files.thumbnailFor", { title: titleText })}
                    loading="lazy"
                    decoding="async"
                    className={cn(
                      "h-full w-full object-cover transform-gpu",
                      "transition-transform nb-duration nb-ease-out motion-reduce:transition-none",
                      "group-hover:scale-[1.02]"
                    )}
                    onError={() => setThumbError(true)}
                  />
                ) : (
                  <div
                    className={cn(
                      "h-full w-full flex items-center justify-center",
                      "bg-gradient-to-br from-muted/60 via-muted/30 to-background/60"
                    )}
                    aria-label={t("files.noThumbnailAvailable")}
                  >
                    <div className="flex items-center gap-2 rounded-2xl border border-border/60 bg-background/60 px-3 py-2 shadow-sm">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs font-medium text-muted-foreground">
                        {typeText.toUpperCase()}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </CardHeader>
    </Card>
  );

  if (!fileUrl) return <div className="cursor-default">{card}</div>;

  return (
    <a
      href={fileUrl}
      target="_blank"
      rel="noreferrer"
      className="block cursor-pointer !no-underline !text-foreground"
      aria-label={t("files.openFile.aria", { title: titleText })}
    >
      {card}
    </a>
  );
}

export function MaterialCardLargeSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("cursor-default", className)}>
      <div className="group relative w-full max-w-[calc(100vw-2rem)] sm:max-w-[360px] rounded-xl border bg-card py-6 shadow-sm">
        <div className="@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-6">
          <div className="space-y-3">
            <div className="flex min-h-[110px] items-start justify-between gap-3">
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <SkeletonPill className="w-12" />
                  <SkeletonPill className="w-14" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-6 w-10/12 rounded-full" />
                  <Skeleton className="h-6 w-7/12 rounded-full" />
                </div>
                <SkeletonText lines={1} className="pt-1" />
              </div>
            </div>

            <div className="flex justify-center">
              <div className="w-full max-w-full sm:max-w-[320px] overflow-hidden rounded-2xl border border-border/60 bg-muted/20 shadow-sm">
                <div className="aspect-[16/9]">
                  <Skeleton className="h-full w-full rounded-none" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
