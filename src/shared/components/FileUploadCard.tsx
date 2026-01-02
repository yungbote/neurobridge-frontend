import type { LucideIcon } from "lucide-react";
import { X, FileText, ImageIcon, Video, Music, File, Archive, Code } from "lucide-react";
import { IconButton } from "@/shared/ui/icon-button";

type FileTypeInfo = {
  icon: LucideIcon;
  label: string;
  color: string;
};

const getFileTypeInfo = (fileName: string, fileType?: string): FileTypeInfo => {
  const extension = fileName.split(".").pop()?.toLowerCase() || "";
  const type = fileType?.toLowerCase() || "";
  if (type.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "svg", "webp", "bmp", "ico"].includes(extension)) {
    return {
      icon: ImageIcon,
      label: "Image",
      color: "bg-chart-1/10 text-chart-1",
    }
  }
  if (type.startsWith("video/") || ["mp4", "mov", "avi", "mkv", "webm", "flv", "wmv"].includes(extension)) {
    return {
      icon: Video,
      label: "Video",
      color: "bg-chart-2/10 text-chart-2",
    }
  }
  if (type.startsWith("audio/") || ["mp3", "wav", "ogg", "flac", "m4a", "aac"].includes(extension)) {
    return {
      icon: Music,
      label: "Audio",
      color: "bg-chart-3/10 text-chart-3",
    }
  }
  if (["zip", "rar", "tar", "gz", "bz2"].includes(extension)) {
    return {
      icon: Archive,
      label: "Archive",
      color: "bg-chart-4/10 text-chart-4",
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
      color: "bg-chart-5/10 text-chart-5",
    }
  }
  if (["pdf", "docx", "txt", "rtf", "odt"].includes(extension)) {
    return {
      icon: FileText,
      label: "Document",
      color: "bg-primary/10 text-primary",
    }
  }
  if (["pt", "pptx", "key", "odp"].includes(extension)) {
    return {
      icon: FileText,
      label: "Presentation",
      color: "bg-warning/10 text-warning",
    }
  }
  if (["xls", "xlsx", "csv", "ods"].includes(extension)) {
    return {
      icon: FileText,
      label: "Spreadsheet",
      color: "bg-success/10 text-success",
    }
  }
  return {
    icon: File,
    label: "File",
    color: "bg-muted text-muted-foreground",
  };
};

type FileUploadCardProps = {
  fileName: string;
  fileType?: string;
  onRemove?: () => void;
};

export const FileUploadCard = ({ fileName, fileType, onRemove }: FileUploadCardProps) => {
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
          <IconButton
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full opacity-0 transition-opacity group-hover:opacity-100"
            onClick={onRemove}
            label="Remove file"
          >
            <X className="h-4 w-4" />
          </IconButton>
        )}
      </div>
    </div>
  );
};






