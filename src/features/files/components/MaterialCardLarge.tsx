import { useEffect, useMemo, useState } from "react";
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

interface MaterialCardLargeProps {
  file?: MaterialFile | null;
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
  const [thumbError, setThumbError] = useState(false);

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

  const titleText = file.originalName || "Untitled file";
  const typeText = fileTypeLabel(file);
  const typeBadgeText = fileTypeBadgeLabel(file);
  const sizeText = file.sizeBytes ? formatBytes(file.sizeBytes) : "";
  const subText = [typeText, sizeText].filter(Boolean).join(" · ") || null;

  const Icon = fileIcon(file);
  const showThumb = Boolean(thumbUrl) && !thumbError;

  const card = (
    <Card className="group relative w-full max-w-[360px] transition-all duration-200 hover:border-foreground/20 hover:shadow-md">
      <div className="absolute right-4 top-4 z-10 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-background/60 text-muted-foreground shadow-sm backdrop-blur-sm transition-colors hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30"
              aria-label="File options"
              title="Options"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              <Ellipsis className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={10} className="w-44">
            <DropdownMenuItem disabled onSelect={(e) => e.preventDefault()}>
              More actions soon
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <CardHeader>
        <div className="space-y-3">
          <div className="flex min-h-[110px] items-start justify-between gap-3">
            <div className="flex-1 space-y-1.5">
              <div className="flex items-center justify-start gap-2">
                <Badge>File</Badge>
                <Badge variant="subtle">{typeBadgeText}</Badge>
              </div>
              <CardTitle className="line-clamp-2 text-balance text-lg leading-tight sm:text-xl">
                {titleText}
              </CardTitle>

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
            <div className="w-full max-w-[320px] overflow-hidden rounded-2xl border border-border/60 bg-muted/30 shadow-sm">
              <div className="aspect-[16/9]">
                {showThumb ? (
                  <img
                    src={thumbUrl}
                    alt={`Thumbnail for ${titleText}`}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                    onError={() => setThumbError(true)}
                  />
                ) : (
                  <div
                    className={cn(
                      "h-full w-full flex items-center justify-center",
                      "bg-gradient-to-br from-muted/60 via-muted/30 to-background/60"
                    )}
                    aria-label="No thumbnail available"
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
      aria-label={`Open file ${titleText}`}
    >
      {card}
    </a>
  );
}
