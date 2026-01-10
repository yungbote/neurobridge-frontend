import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, Maximize2, X } from "lucide-react";

import { cn } from "@/shared/lib/utils";
import { useI18n } from "@/app/providers/I18nProvider";
import { getAccessToken } from "@/shared/services/StorageService";

type ImageLightboxProps = {
  src: string;
  alt?: string;
  caption?: string;
  className?: string;
  frameClassName?: string;
  imageClassName?: string;
};

export function ImageLightbox({
  src,
  alt,
  caption,
  className,
  frameClassName,
  imageClassName,
}: ImageLightboxProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  const resolveImageSrc = (raw: string) => {
    const trimmed = String(raw || "").trim();
    if (!trimmed) return trimmed;
    if (trimmed.startsWith("data:") || trimmed.startsWith("blob:")) return trimmed;

    const apiBase = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");
    let resolved = trimmed;
    if (apiBase && apiBase.startsWith("http") && trimmed.startsWith("/api")) {
      resolved = apiBase.endsWith("/api") ? `${apiBase}${trimmed.slice("/api".length)}` : `${apiBase}${trimmed}`;
    }

    const token = getAccessToken();
    if (!token) return resolved;
    if (resolved.includes("token=")) return resolved;

    const isApiURL =
      (apiBase && resolved.startsWith(apiBase)) || resolved.startsWith("/api/");
    if (!isApiURL) return resolved;

    return `${resolved}${resolved.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`;
  };

  const resolvedSrc = resolveImageSrc(src);

  useEffect(() => {
    setLoaded(false);
    setHasError(false);
  }, [resolvedSrc]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <figure className={cn("space-y-2", className)}>
        <button
          type="button"
          className={cn(
            "group relative w-full cursor-pointer overflow-hidden rounded-2xl border border-border/60 bg-muted/20 text-start",
            frameClassName
          )}
          onClick={() => setOpen(true)}
          aria-label={t("media.openImage")}
        >
          {!loaded && !hasError ? (
            <div className="absolute inset-0 animate-pulse bg-muted" />
          ) : null}
          {hasError ? (
            <div className="flex h-48 items-center justify-center text-muted-foreground">
              <AlertCircle className="me-2 h-5 w-5" />
              <span>{t("media.failedToLoadImage")}</span>
            </div>
          ) : (
            <>
              <img
                src={resolvedSrc}
                alt={alt || t("common.image")}
                onLoad={() => setLoaded(true)}
                onError={() => setHasError(true)}
                loading="lazy"
                decoding="async"
                className={cn(
                  "h-auto w-full transition-opacity duration-300",
                  imageClassName,
                  loaded ? "opacity-100" : "opacity-0"
                )}
              />
              <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/10">
                <Maximize2 className="h-8 w-8 text-white opacity-0 drop-shadow-lg transition-opacity group-hover:opacity-100" />
              </div>
            </>
          )}
        </button>
        {caption ? <figcaption className="text-xs text-muted-foreground">{caption}</figcaption> : null}
      </figure>

      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 backdrop-blur-sm p-4"
              onClick={() => setOpen(false)}
            >
              <button
                type="button"
                className="absolute end-4 top-4 rounded-full p-2 text-white/90 transition-colors hover:bg-white/10"
                onClick={() => setOpen(false)}
                aria-label={t("media.closeImage")}
              >
                <X className="h-6 w-6" />
              </button>
              <img
                src={resolvedSrc}
                alt={alt || t("common.image")}
                className="max-h-[90vh] max-w-[92vw] rounded-2xl object-contain shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              />
            </div>,
            document.body
          )
        : null}
    </>
  );
}
