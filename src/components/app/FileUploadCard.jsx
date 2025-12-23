import { X, FileText, ImageIcon, Video, Music, File, Archive, Code } from "lucide-react";
import { Button } from "@/components/ui/button";

const getFileTypeInfo = (fileName, fileType) => {
  const extension = fileName.split(".").pop()?.toLowerCase() || "";
  const type = fileType?.toLowerCase() || "";
  if (type.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "svg", "webp", "bmp", "ico"].includes(extension)) {
    return {
      icon: ImageIcon,
      label: "Image",
      color: "bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400",
    }
  }
  if (type.startsWith("video/") || ["mp4", "mov", "avi", "mkv", "webm", "flv", "wmv"].includes(extension)) {
    return {
      icon: Video,
      label: "Video",
      color: "bg-purple-100 text-purple-600 dark:bg-purple-950 dark:text-purple-400",
    }
  }
  if (type.startsWith("audio/") || ["mp3", "wav", "ogg", "flac", "m4a", "aac"].includes(extension)) {
    return {
      icon: Music,
      label: "Audio",
      color: "bg-pink-100 text-pink-600 dark:bg-pink-950 dark:text-pink-400",
    }
  }
  if (["zip", "rar", "tar", "gz", "bz2"].includes(extension)) {
    return {
      icon: Archive,
      label: "Archive",
      color: "bg-orange-100 text-orange-600 dark:bg-orange-950 dark:text-orange-400",
    }
  }
  if (
    [
      "js",
      "jsx",
      "ts",
      "tsx",
      "py",
      "java",
      "cpp",
      "c",
      "cs",
      "php",
      "rb",
      "go",
      "rs",
      "swift",
      "kt",
      "html",
      "css",
      "scss",
      "json",
      "xml",
      "yaml",
      "yml",
    ].includes(extension)
  ) {
    return {
      icon: Code,
      label: "Code",
      color: "bg-green-100 text-green-600 dark:bg-green-950 dark:text-green-400",
    }
  }
  if (["pdf", "docx", "txt", "rtf", "odt"].includes(extension)) {
    return {
      icon: FileText,
      label: "Document",
      color: "bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400",
    }
  }
  if (["pt", "pptx", "key", "odp"].includes(extension)) {
    return {
      icon: FileText,
      label: "Presentation",
      color: "bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400",
    }
  }
  if (["xls", "xlsx", "csv", "ods"].includes(extension)) {
    return {
      icon: FileText,
      label: "Spreadsheet",
      color: "bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400",
    }
  }
  return {
    icon: File,
    label: "File",
    color: "bg-muted text-muted-foreground",
  }
}

export const FileUploadCard = ({ fileName, fileType, onRemove }) => {
  const fileInfo = getFileTypeInfo(fileName, fileType);
  const Icon = fileInfo.icon;

  return (
    <div 
      className="group relative flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:bg-accent/50
      w-[260px] min-w-[260px] max-w-[260px]"
    >
      <div
        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg ${fileInfo.color}`}
      >
        <Icon className="h-6 w-6" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{fileName}</p>
        <p className="text-xs text-muted-foreground">{fileInfo.label}</p>
      </div>
      <div className="h-8 w-8 shrink-0">
        {onRemove && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full opacity-0 transition-opacity group-hover:opacity-100"
            onClick={onRemove}
            aria-label="Remove file"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}










