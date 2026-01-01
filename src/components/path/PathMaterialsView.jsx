import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  File,
  FileText,
  Maximize2,
} from "lucide-react";

import { listPathMaterials } from "@/api/MaterialService";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { EmptyContent } from "@/components/app/EmptyContent";
import { cn } from "@/lib/utils";

function formatBytes(v) {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  const idx = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  const value = n / Math.pow(1024, idx);
  return `${value.toFixed(value >= 10 || idx === 0 ? 0 : 1)} ${units[idx]}`;
}

function fileIcon(file) {
  const mime = String(file?.mimeType || "").toLowerCase();
  if (mime.includes("pdf")) return FileText;
  return File;
}

function normalizePageAssets(assets) {
  const allowed = new Set(["pdf_page", "ppt_slide", "frame", "image"]);
  const list = (assets || [])
    .filter((a) => a && a.url)
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
  className,
}) {
  return (
    <div className={cn("grid gap-4 lg:grid-cols-[280px_1fr]", className)}>
      <aside className="rounded-xl border border-border bg-card p-3">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Materials
        </div>
        <div className="mt-3 space-y-2">
          {files.map((f) => {
            const Icon = fileIcon(f);
            const isActive = f.id === selectedFile?.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => onSelectFile(f)}
                className={cn(
                  "flex w-full items-start gap-3 rounded-lg border px-3 py-2 text-left transition-colors",
                  isActive
                    ? "border-foreground/20 bg-muted/40 text-foreground"
                    : "border-border bg-background hover:bg-muted/30 text-muted-foreground"
                )}
              >
                <div className="mt-0.5 rounded-md bg-muted/60 p-2 text-muted-foreground">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-foreground">
                    {f.originalName || "Untitled file"}
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

      <section className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Document
            </div>
            <div className="mt-1 text-lg font-semibold text-foreground">
              {selectedFile?.originalName || "Select a document"}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {pageLabel ? (
              <div className="rounded-full border border-border/60 px-3 py-1 text-xs text-muted-foreground">
                {pageLabel}
              </div>
            ) : null}
            {showPager ? (
              <>
                <Button variant="ghost" size="icon" onClick={onPrevPage} disabled={disablePrev}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onNextPage}
                  disabled={disableNext}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </>
            ) : null}
            {showFullscreen ? (
              <Button variant="ghost" size="icon" onClick={onOpenFullscreen} aria-label="Open fullscreen">
                <Maximize2 className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        </div>

        <div className="mt-4">{viewerNode}</div>
      </section>
    </div>
  );
}

export function PathMaterialsView({ pathId }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [files, setFiles] = useState([]);
  const [assetsByFile, setAssetsByFile] = useState({});
  const [selectedFileId, setSelectedFileId] = useState(null);
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
          setError(String(err?.message || "Failed to load materials"));
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
    const assets = selectedFile ? assetsByFile?.[selectedFile.id] : null;
    return normalizePageAssets(assets);
  }, [assetsByFile, selectedFile]);

  const pageLabel = useMemo(() => {
    if (pageAssets.length > 0) {
      return `Page ${pageIndex + 1} of ${pageAssets.length}`;
    }
    if (selectedFile?.mimeType?.includes("pdf")) {
      return `Page ${pdfPage}`;
    }
    return "";
  }, [pageAssets.length, pageIndex, pdfPage, selectedFile?.mimeType]);

  const handlePrevPage = useCallback(() => {
    if (pageAssets.length > 0) {
      setPageIndex((prev) => Math.max(0, prev - 1));
      return;
    }
    if (selectedFile?.mimeType?.includes("pdf")) {
      setPdfPage((prev) => Math.max(1, prev - 1));
    }
  }, [pageAssets.length, selectedFile?.mimeType]);

  const handleNextPage = useCallback(() => {
    if (pageAssets.length > 0) {
      setPageIndex((prev) => Math.min(pageAssets.length - 1, prev + 1));
      return;
    }
    if (selectedFile?.mimeType?.includes("pdf")) {
      setPdfPage((prev) => prev + 1);
    }
  }, [pageAssets.length, selectedFile?.mimeType]);

  const viewerHeight = fullscreenOpen ? "h-[72vh]" : "h-[520px]";

  const viewerNode = useMemo(() => {
    if (!selectedFile) {
      return (
        <EmptyContent
          title="Select a document"
          message="Choose a file on the left to view it here."
          helperText=""
        />
      );
    }

    if (pageAssets.length > 0) {
      const asset = pageAssets[pageIndex];
      return (
        <div className={cn("flex items-center justify-center rounded-xl border border-border bg-muted/20", viewerHeight)}>
          <img
            src={asset.url}
            alt={selectedFile.originalName || "Document page"}
            className="max-h-full max-w-full object-contain"
          />
        </div>
      );
    }

    if (selectedFile.fileUrl) {
      const isPdf = selectedFile.mimeType?.includes("pdf");
      const src = isPdf ? `${selectedFile.fileUrl}#page=${pdfPage}&view=FitH` : selectedFile.fileUrl;
      return (
        <div className={cn("overflow-hidden rounded-xl border border-border bg-muted/20", viewerHeight)}>
          <iframe title={selectedFile.originalName || "Document"} src={src} className="h-full w-full" />
        </div>
      );
    }

    return (
      <EmptyContent
        title="No preview available"
        message="This file does not have a preview yet."
        helperText=""
      />
    );
  }, [pageAssets, pageIndex, pdfPage, selectedFile, viewerHeight]);

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
        Loading materials…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
        {error}
      </div>
    );
  }

  if (!files || files.length === 0) {
    return (
      <EmptyContent
        title="No materials yet"
        message="Upload documents to see them here."
        helperText=""
      />
    );
  }

  const layoutProps = {
    files,
    selectedFile,
    onSelectFile: (file) => setSelectedFileId(file?.id || null),
    pageAssets,
    pageIndex,
    onPrevPage: handlePrevPage,
    onNextPage: handleNextPage,
    pageLabel,
    viewerNode,
    showPager: pageAssets.length > 0 || Boolean(selectedFile?.mimeType?.includes("pdf")),
    disablePrev: pageAssets.length > 0 ? pageIndex <= 0 : pdfPage <= 1,
    disableNext: pageAssets.length > 0 ? pageIndex >= Math.max(0, pageAssets.length - 1) : false,
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
          className="h-[90vh] max-w-[96vw] w-[96vw] overflow-hidden p-4"
        >
          <ViewerLayout
            {...layoutProps}
            showFullscreen={false}
            className="h-full"
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
