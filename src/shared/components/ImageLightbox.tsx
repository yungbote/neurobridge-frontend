import React, { useEffect, useState } from "react";
import { AlertCircle, Maximize2, X } from "lucide-react";

import { cn } from "@/shared/lib/utils";

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
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      <figure className={cn("space-y-2", className)}>
        <div
          className={cn(
            "group relative cursor-pointer overflow-hidden rounded-xl border border-border bg-muted/20",
            frameClassName
          )}
          onClick={() => setOpen(true)}
        >
          {!loaded && !hasError ? (
            <div className="absolute inset-0 animate-pulse bg-muted" />
          ) : null}
          {hasError ? (
            <div className="flex h-48 items-center justify-center text-muted-foreground">
              <AlertCircle className="mr-2 h-5 w-5" />
              <span>Failed to load image</span>
            </div>
          ) : (
            <>
              <img
                src={src}
                alt={alt || "Image"}
                onLoad={() => setLoaded(true)}
                onError={() => setHasError(true)}
                className={cn("h-auto w-full transition-opacity duration-300", imageClassName, loaded ? "opacity-100" : "opacity-0")}
              />
              <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/10">
                <Maximize2 className="h-8 w-8 text-white opacity-0 drop-shadow-lg transition-opacity group-hover:opacity-100" />
              </div>
            </>
          )}
        </div>
        {caption ? <figcaption className="text-xs text-muted-foreground">{caption}</figcaption> : null}
      </figure>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setOpen(false)}
        >
          <button
            type="button"
            className="absolute right-4 top-4 rounded-lg p-2 text-white transition-colors hover:bg-white/10"
            onClick={() => setOpen(false)}
          >
            <X className="h-6 w-6" />
          </button>
          <img
            src={src}
            alt={alt || "Image"}
            className="max-h-full max-w-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : null}
    </>
  );
}
