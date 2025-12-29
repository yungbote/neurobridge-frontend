import React, { useState, useRef, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Upload, X, FileText, ImageIcon, File as FileIcon, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePaths } from "@/providers/PathProvider";

// Shape we are using internally: { id, name, size, type, file?: File, content?: string }
export function FileUploadDialog({
  trigger,
  onUpload,
  title = "Upload Materials",
  description = "Upload PDFs, slides, notes, or any other learning materials.",
  submitLabel = "Upload",
}) {
  const { uploadMaterialSet } = usePaths();
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [textContent, setTextContent] = useState("");
  const fileInputRef = useRef(null);
  const dragCounter = useRef(0);

  const handleFiles = useCallback((newFiles) => {
    const fileArray = Array.from(newFiles);
    const uploadedFiles = fileArray.map((file) => ({
      id: Math.random().toString(36).substring(7),
      name: file.name,
      size: file.size,
      type: file.type,
      file,
    }));
    setFiles((prev) => [...prev, ...uploadedFiles]);
  }, []);

  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      dragCounter.current = 0;
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files);
      }
    },
    [handleFiles],
  );

  const handleFileInput = useCallback(
    (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handleFiles(e.target.files);
      }
    },
    [handleFiles],
  );

  const handleTextPaste = useCallback(() => {
    if (textContent.trim()) {
      const blob = new Blob([textContent], { type: "text/plain" });
      const file = new File([blob], `pasted-content-${Date.now()}.txt`, { type: "text/plain" });
      const uploadedFile = {
        id: Math.random().toString(36).substring(7),
        name: file.name,
        size: file.size,
        type: file.type,
        file,
        content: textContent,
      };
      setFiles((prev) => [...prev, uploadedFile]);
      setTextContent("");
    }
  }, [textContent]);

  const removeFile = useCallback((id) => {
    setFiles((prev) => prev.filter((file) => file.id !== id));
  }, []);

  const handleSend = useCallback(async () => {
    const uploadFn = onUpload || uploadMaterialSet;
    if (!uploadFn) return;

    let filesToUpload = files.map((f) => f.file).filter(Boolean);

    if (textContent.trim()) {
      const blob = new Blob([textContent], { type: "text/plain" });
      const textFile = new File([blob], `pasted-content-${Date.now()}.txt`, { type: "text/plain" });
      filesToUpload = [...filesToUpload, textFile];
    }

    if (filesToUpload.length === 0) {
      return;
    }

    console.log(
      "[FileUploadDialog] Uploading files:",
      filesToUpload.map((f) => f.name),
    );

    try {
      await uploadFn(filesToUpload);
      setOpen(false);
      setFiles([]);
      setTextContent("");
    } catch (err) {
      console.error("[FileUploadDialog] uploadMaterialSet failed:", err);
    }
  }, [files, textContent, uploadMaterialSet, onUpload]);

  const formatFileSize = (bytes) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  const getFileIcon = (type) => {
    if (typeof type !== "string") return FileIcon;
    if (type.startsWith("image/")) return ImageIcon;
    if (type.startsWith("text/")) return FileText;
    return FileIcon;
  };

  const readyCount = files.length + (textContent.trim() ? 1 : 0);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button size="sm" className="gap-2">
            <Upload className="h-4 w-4" />
            Upload
          </Button>
        )}
      </DialogTrigger>

      <DialogContent
        className="bg-card max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0"
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
          <DialogTitle className="text-xl font-semibold">{title}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* Drop Zone */}
          <div
            className={cn(
              "relative border-2 border-dashed rounded-lg p-6 text-center transition-all cursor-pointer hover:border-primary/50 hover:bg-muted/30 sm:p-8",
              isDragging ? "border-primary bg-primary/5 scale-[0.98]" : "border-border",
            )}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileInput}
              className="hidden"
            />
            <div className="flex flex-col items-center gap-3">
              <div
                className={cn(
                  "h-12 w-12 rounded-full flex items-center justify-center transition-colors",
                  isDragging ? "bg-primary/10" : "bg-muted",
                )}
              >
                <Upload
                  className={cn(
                    "h-6 w-6 transition-colors",
                    isDragging ? "text-primary" : "text-muted-foreground",
                  )}
                />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">
                  {isDragging ? "Drop files here" : "Click to upload or drag and drop"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {description}
                </p>
              </div>
            </div>
          </div>

          {/* Text Paste Area */}
          <div className="mt-6">
            <label className="text-sm font-medium text-foreground mb-2 block">
              Or paste text content
            </label>
            <Textarea
              value={textContent}
              onChange={(e) => setTextContent(e.target.value)}
              placeholder="Paste text here and it will be turned into a file…"
              className="min-h-[100px] resize-none"
            />
            {textContent.trim() && (
              <Button
                onClick={handleTextPaste}
                variant="outline"
                size="sm"
                className="mt-2 bg-transparent"
              >
                Convert to File
              </Button>
            )}
          </div>

          {/* Uploaded Files List */}
          {files.length > 0 && (
            <div className="mt-6">
              <label className="text-sm font-medium text-foreground mb-3 block">
                Uploaded Files ({files.length})
              </label>
              <div className="space-y-2">
                {files.map((file) => {
                  const Icon = getFileIcon(file.type);
                  return (
                    <div
                      key={file.id}
                      className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors group"
                    >
                      <div className="h-10 w-10 rounded-md bg-background flex items-center justify-center flex-shrink-0">
                        <Icon className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {file.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatFileSize(file.size)}
                        </p>
                      </div>
                      <Button
                        onClick={() => removeFile(file.id)}
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 opacity-100 transition-opacity flex-shrink-0 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-4 border-t border-border flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="text-sm text-muted-foreground">
            {readyCount === 0
              ? "No files ready"
              : `${readyCount} file${readyCount === 1 ? "" : "s"} ready`}
          </p>
          <div className="flex w-full gap-2 sm:w-auto sm:justify-end">
            <Button
              onClick={() => {
                setOpen(false);
                setFiles([]);
                setTextContent("");
              }}
              variant="outline"
              className="flex-1 sm:flex-none"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSend}
              disabled={readyCount === 0}
              className="flex-1 gap-2 sm:flex-none"
            >
              <Send className="h-4 w-4" />
              {submitLabel}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}









