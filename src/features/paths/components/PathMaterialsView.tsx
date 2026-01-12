import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  File,
  FileText,
  Maximize2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { listPathMaterials } from "@/shared/api/MaterialService";
import { Button } from "@/shared/ui/button";
import { IconButton } from "@/shared/ui/icon-button";
import { Dialog, DialogContent } from "@/shared/ui/dialog";
import { EmptyContent } from "@/shared/components/EmptyContent";
import { cn } from "@/shared/lib/utils";
import { getAccessToken } from "@/shared/services/StorageService";
import { useI18n } from "@/app/providers/I18nProvider";
import { Skeleton, SkeletonText } from "@/shared/ui/skeleton";
import type { MaterialAsset, MaterialFile } from "@/shared/types/models";

type MaterialAssetsByFile = Record<string, MaterialAsset[]>;

function formatBytes(v: unknown) {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  const idx = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  const value = n / Math.pow(1024, idx);
  return `${value.toFixed(value >= 10 || idx === 0 ? 0 : 1)} ${units[idx]}`;
}

function fileIcon(file: MaterialFile): LucideIcon {
  const mime = String(file?.mimeType || "").toLowerCase();
  if (mime.includes("pdf")) return FileText;
  return File;
}

function normalizePageAssets(assets: MaterialAsset[] | null | undefined): MaterialAsset[] {
  const allowed = new Set(["pdf_page", "ppt_slide", "frame", "image"]);
  const list = (assets || [])
    .filter((a): a is MaterialAsset => Boolean(a?.id && (a?.storageKey || a?.url)))
    .filter((a) => !a.kind || allowed.has(String(a.kind).toLowerCase()));
  const byPage = list.filter((a) => typeof a.page === "number");
  if (byPage.length > 0) {
    return byPage.sort((a, b) => (a.page ?? 0) - (b.page ?? 0));
  }
  return list.sort((a, b) => {
    const ad = new Date(a?.createdAt || 0).getTime();
    const bd = new Date(b?.createdAt || 0).getTime();
    return ad - bd;
  });
}

export function PathMaterialsViewSkeleton({ fullscreen = false }: { fullscreen?: boolean }) {
  return (
    <div
      className={cn(
        "grid gap-5 lg:grid-cols-[300px_1fr]",
        fullscreen && "h-full min-h-0"
      )}
      aria-busy="true"
    >
      <aside
        className={cn(
          "rounded-2xl border border-border/60 bg-card/70 p-3 shadow-sm backdrop-blur",
          fullscreen && "flex h-full min-h-0 flex-col"
        )}
      >
        <div className="flex items-center justify-between gap-2 px-1">
          <Skeleton className="h-4 w-24 rounded-full" />
          <Skeleton className="h-3 w-16 rounded-full" />
        </div>

        <div className={cn("mt-3 space-y-2", fullscreen && "min-h-0 flex-1 overflow-y-auto pe-1")}>
          {Array.from({ length: 7 }).map((_, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <div key={i} className="flex items-start gap-3 rounded-xl border border-border/60 bg-background/70 px-3 py-2">
              <Skeleton className="mt-0.5 h-8 w-8 rounded-md" />
              <div className="min-w-0 flex-1">
                <Skeleton className="h-4 w-10/12 rounded-full" />
                <Skeleton className="mt-2 h-3 w-6/12 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </aside>

      <div className={cn(fullscreen && "flex h-full min-h-0 flex-col")}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Skeleton className="h-8 w-40 rounded-full" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 w-9 rounded-full" />
            <Skeleton className="h-9 w-9 rounded-full" />
            <Skeleton className="h-9 w-28 rounded-full" />
          </div>
        </div>

        <div className={cn("mt-4", fullscreen ? "flex-1 min-h-0" : "")}>
          <div className={cn("overflow-hidden rounded-2xl border border-border/60 bg-muted/20", fullscreen ? "h-full" : "h-[520px]")}>
            <Skeleton className="h-full w-full rounded-none" />
          </div>
          <SkeletonText lines={2} className="mt-3 max-w-md" />
        </div>
      </div>
    </div>
  );
}

interface ViewerLayoutProps {
  files: MaterialFile[];
  selectedFile: MaterialFile | null;
  onSelectFile: (file: MaterialFile) => void;
  pageAssets: MaterialAsset[];
  pageIndex: number;
  onPrevPage: () => void;
  onNextPage: () => void;
  pageLabel: string;
  viewerNode: React.ReactNode;
  showPager: boolean;
  disablePrev: boolean;
  disableNext: boolean;
  showFullscreen: boolean;
  onOpenFullscreen?: () => void;
  openUrl?: string;
  fullscreen?: boolean;
  className?: string;
}

function ViewerLayout({
  files,
  selectedFile,
  onSelectFile,
  pageAssets,
  pageIndex,
  onPrevPage,
  onNextPage,
  pageLabel,
  viewerNode,
  showPager,
  disablePrev,
  disableNext,
  showFullscreen,
  onOpenFullscreen,
  openUrl,
  fullscreen = false,
  className,
}: ViewerLayoutProps) {
  const { t } = useI18n();
  return (
    <div className={cn("grid gap-5 lg:grid-cols-[300px_1fr]", fullscreen && "h-full min-h-0", className)}>
      <aside
        className={cn(
          "rounded-2xl border border-border/60 bg-card/70 p-3 shadow-sm backdrop-blur",
          fullscreen && "flex h-full min-h-0 flex-col"
        )}
      >
        <div className="flex items-center justify-between gap-2 px-1">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("paths.tabs.materials")}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {files.length} {files.length === 1 ? t("common.file") : t("common.files")}
          </div>
        </div>
        <div className={cn("mt-3 space-y-2", fullscreen && "min-h-0 flex-1 overflow-y-auto pe-1")}>
          {files.map((f) => {
            const Icon = fileIcon(f);
            const isActive = f.id === selectedFile?.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => onSelectFile(f)}
                className={cn(
                  "group flex w-full items-start gap-3 rounded-xl border text-start",
                  // Touch-friendly sizing (min 56px height on mobile)
                  "min-h-[56px] sm:min-h-[48px] px-3 py-3 sm:py-2",
                  // Transitions
                  "nb-motion-fast motion-reduce:transition-none",
                  // Touch optimizations
                  "touch-manipulation -webkit-tap-highlight-color-transparent",
                  "active:scale-[0.98]",
                  isActive
                    ? "border-primary/20 bg-primary/5 text-foreground shadow-sm"
                    : "border-border/60 bg-background/70 text-muted-foreground hover:bg-muted/40 active:bg-muted/50"
                )}
              >
                <div
                  className={cn(
                    "mt-0.5 rounded-md p-2 transition-colors",
                    isActive ? "bg-primary/10 text-foreground" : "bg-muted/50 text-muted-foreground"
                  )}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-foreground">
                    {f.originalName || t("common.untitledFile")}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {f.mimeType ? <span>{f.mimeType}</span> : null}
                    {f.sizeBytes ? <span>· {formatBytes(f.sizeBytes)}</span> : null}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      <section
        className={cn(
          "overflow-hidden rounded-2xl border border-border/60 bg-card/70 shadow-sm backdrop-blur",
          fullscreen && "flex h-full min-h-0 flex-col"
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("paths.materials.document")}
            </div>
            <div className="mt-1 text-lg font-semibold text-foreground">
              {selectedFile?.originalName || t("paths.materials.selectDocument")}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {pageLabel ? (
              <div className="rounded-full border border-border/60 px-3 py-1 text-xs text-muted-foreground">
                {pageLabel}
              </div>
            ) : null}
            {openUrl ? (
              <IconButton
                variant="ghost"
                size="icon"
                label={t("common.openInNewTab")}
                shortcut="O"
                asChild
              >
                <a href={openUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4" />
                </a>
              </IconButton>
            ) : null}
            {showPager ? (
              <>
                <IconButton
                  variant="ghost"
                  size="icon"
                  onClick={onPrevPage}
                  disabled={disablePrev}
                  label={t("common.previousPage")}
                  shortcut="Left"
                >
                  <ChevronLeft className="h-4 w-4" />
                </IconButton>
                <IconButton
                  variant="ghost"
                  size="icon"
                  onClick={onNextPage}
                  disabled={disableNext}
                  label={t("common.nextPage")}
                  shortcut="Right"
                >
                  <ChevronRight className="h-4 w-4" />
                </IconButton>
              </>
            ) : null}
            {showFullscreen ? (
              <IconButton
                variant="ghost"
                size="icon"
                onClick={onOpenFullscreen}
                label={t("common.openFullscreen")}
                shortcut="F"
              >
                <Maximize2 className="h-4 w-4" />
              </IconButton>
            ) : null}
          </div>
        </div>

        <div className={cn("p-4", fullscreen && "flex-1 min-h-0")}>{viewerNode}</div>
      </section>
    </div>
  );
}

function getErrorMessage(err: unknown, fallback: string) {
  if (err instanceof Error) return err.message || fallback;
  if (typeof err === "string" && err.trim()) return err;
  return fallback;
}

interface PathMaterialsViewProps {
  pathId?: string | null;
}

export function PathMaterialsView({ pathId }: PathMaterialsViewProps) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [files, setFiles] = useState<MaterialFile[]>([]);
  const [assetsByFile, setAssetsByFile] = useState<MaterialAssetsByFile>({});
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [pdfPage, setPdfPage] = useState(1);
  const [fullscreenOpen, setFullscreenOpen] = useState(false);

  useEffect(() => {
    if (!pathId) return;
    let cancelled = false;
    setLoading(true);
    setError("");

    (async () => {
      try {
        const res = await listPathMaterials(pathId);
        if (cancelled) return;
        const sorted = (res.files || []).slice().sort((a, b) => {
          const ad = new Date(a?.createdAt || 0).getTime();
          const bd = new Date(b?.createdAt || 0).getTime();
          return bd - ad;
        });
        setFiles(sorted);
        setAssetsByFile(res.assetsByFile || {});
        setSelectedFileId((prev) => {
          if (prev && sorted.some((f) => f.id === prev)) return prev;
          return sorted[0]?.id || null;
        });
      } catch (err) {
        if (!cancelled) {
          setError(getErrorMessage(err, t("paths.materials.loadFailed")));
          setFiles([]);
          setAssetsByFile({});
          setSelectedFileId(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pathId]);

  useEffect(() => {
    setPageIndex(0);
    setPdfPage(1);
  }, [selectedFileId]);

  const selectedFile = useMemo(
    () => files.find((f) => f.id === selectedFileId) || null,
    [files, selectedFileId]
  );

  const pageAssets = useMemo(() => {
    const assets = selectedFile ? assetsByFile[selectedFile.id] : null;
    return normalizePageAssets(assets);
  }, [assetsByFile, selectedFile]);

  const fileName = String(selectedFile?.originalName || "").toLowerCase();
  const isPdf = Boolean(selectedFile?.mimeType?.includes("pdf")) || fileName.endsWith(".pdf");
  const isImage =
    Boolean(selectedFile?.mimeType?.startsWith("image/")) ||
    /\.(png|jpe?g|gif|webp|svg)$/.test(fileName);
  const isVideo =
    Boolean(selectedFile?.mimeType?.startsWith("video/")) ||
    /\.(mp4|mov|m4v|webm)$/.test(fileName);
  const isAudio =
    Boolean(selectedFile?.mimeType?.startsWith("audio/")) ||
    /\.(mp3|wav|m4a|aac|ogg)$/.test(fileName);

  const pageLabel = useMemo(() => {
    if (pageAssets.length > 0) {
      return t("common.pageOf", { current: pageIndex + 1, total: pageAssets.length });
    }
    if (isPdf) {
      return t("common.page", { page: pdfPage });
    }
    return "";
  }, [isPdf, pageAssets.length, pageIndex, pdfPage, t]);

  const handlePrevPage = useCallback(() => {
    if (pageAssets.length > 0) {
      setPageIndex((prev) => Math.max(0, prev - 1));
      return;
    }
    if (isPdf) {
      setPdfPage((prev) => Math.max(1, prev - 1));
    }
  }, [isPdf, pageAssets.length]);

  const handleNextPage = useCallback(() => {
    if (pageAssets.length > 0) {
      setPageIndex((prev) => Math.min(pageAssets.length - 1, prev + 1));
      return;
    }
    if (isPdf) {
      setPdfPage((prev) => prev + 1);
    }
  }, [isPdf, pageAssets.length]);

  const viewerHeight = fullscreenOpen ? "h-full min-h-0" : "h-[360px] sm:h-[520px]";
  const apiBase = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");
  const buildFileViewUrl = useCallback(
    (fileId: string) => {
      const token = getAccessToken();
      const baseUrl = `${apiBase}/material-files/${fileId}/view`;
      return token ? `${baseUrl}?token=${encodeURIComponent(token)}` : baseUrl;
    },
    [apiBase]
  );
  const buildAssetViewUrl = useCallback(
    (assetId: string) => {
      const token = getAccessToken();
      const baseUrl = `${apiBase}/material-assets/${assetId}/view`;
      return token ? `${baseUrl}?token=${encodeURIComponent(token)}` : baseUrl;
    },
    [apiBase]
  );

  const viewerNode = useMemo(() => {
    if (!selectedFile) {
      return (
        <EmptyContent
          title={t("paths.materials.selectDocument")}
          message={t("paths.materials.selectHint")}
          helperText=""
        />
      );
    }

    if (pageAssets.length > 0) {
      const asset = pageAssets[pageIndex];
      if (!asset) {
        return (
          <EmptyContent
            title={t("paths.materials.noPreview.title")}
            message={t("paths.materials.noPreview.message")}
            helperText=""
          />
        );
      }
      const assetSrc = asset.storageKey ? buildAssetViewUrl(asset.id) : asset.url;
      return (
        <div
          className={cn(
            "flex items-center justify-center rounded-2xl border border-border/60 bg-muted/20",
            viewerHeight
          )}
        >
          <img
            src={assetSrc}
            alt={selectedFile.originalName || t("paths.materials.alt.documentPage")}
            className="max-h-full max-w-full object-contain"
          />
        </div>
      );
    }

    if (selectedFile.id) {
      const fileUrl = buildFileViewUrl(selectedFile.id);
      if (isImage) {
        return (
          <div className={cn("flex items-center justify-center rounded-2xl border border-border/60 bg-muted/20", viewerHeight)}>
            <img
              src={fileUrl}
              alt={selectedFile.originalName || t("common.image")}
              className="max-h-full max-w-full object-contain"
            />
          </div>
        );
      }
      if (isVideo) {
        return (
          <div className={cn("overflow-hidden rounded-2xl border border-border/60 bg-muted/20", viewerHeight)}>
            <video className="h-full w-full" controls src={fileUrl} />
          </div>
        );
      }
      if (isAudio) {
        return (
          <div className={cn("flex items-center justify-center rounded-2xl border border-border/60 bg-muted/20", viewerHeight)}>
            <audio controls src={fileUrl} className="w-full max-w-md" />
          </div>
        );
      }
      if (isPdf) {
        const src = `${fileUrl}#page=${pdfPage}&view=FitH`;
        return (
          <div className={cn("overflow-hidden rounded-2xl border border-border/60 bg-muted/20", viewerHeight)}>
            <iframe title={selectedFile.originalName || t("paths.materials.document")} src={src} className="h-full w-full" />
          </div>
        );
      }
      return (
        <div className={cn("flex items-center justify-center rounded-2xl border border-border/60 bg-muted/20", viewerHeight)}>
          <div className="space-y-3 text-center">
            <div className="text-sm text-muted-foreground">{t("paths.materials.previewUnavailable")}</div>
            <Button asChild size="sm">
              <a href={fileUrl} target="_blank" rel="noreferrer">
                {t("paths.materials.openFile")}
              </a>
            </Button>
          </div>
        </div>
      );
    }

    return (
      <EmptyContent
        title={t("paths.materials.noPreview.title")}
        message={t("paths.materials.noPreview.message")}
        helperText=""
      />
    );
  }, [
    buildAssetViewUrl,
    buildFileViewUrl,
    isAudio,
    isImage,
    isPdf,
    isVideo,
    pageAssets,
    pageIndex,
    pdfPage,
    selectedFile,
    t,
    viewerHeight,
  ]);

  if (loading) {
    return <PathMaterialsViewSkeleton />;
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card/70 p-6 text-sm text-muted-foreground shadow-sm backdrop-blur">
        {error}
      </div>
    );
  }

  if (!files || files.length === 0) {
    return (
      <EmptyContent
        title={t("paths.materials.empty.title")}
        message={t("paths.materials.empty.message")}
        helperText=""
      />
    );
  }

  const layoutProps: ViewerLayoutProps = {
    files,
    selectedFile,
    onSelectFile: (file) => setSelectedFileId(file.id),
    pageAssets,
    pageIndex,
    onPrevPage: handlePrevPage,
    onNextPage: handleNextPage,
    pageLabel,
    viewerNode,
    showPager: pageAssets.length > 0 || isPdf,
    disablePrev: pageAssets.length > 0 ? pageIndex <= 0 : pdfPage <= 1,
    disableNext: pageAssets.length > 0 ? pageIndex >= Math.max(0, pageAssets.length - 1) : false,
    showFullscreen: false,
    openUrl: selectedFile ? buildFileViewUrl(selectedFile.id) : undefined,
    fullscreen: false,
  };

  return (
    <>
      <ViewerLayout
        {...layoutProps}
        showFullscreen
        onOpenFullscreen={() => setFullscreenOpen(true)}
      />

      <Dialog open={fullscreenOpen} onOpenChange={setFullscreenOpen}>
        <DialogContent
          className="h-[92vh] max-w-[96vw] w-[96vw] overflow-hidden p-3 sm:p-4"
        >
          <ViewerLayout
            {...layoutProps}
            showFullscreen={false}
            fullscreen
            className="h-full"
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
