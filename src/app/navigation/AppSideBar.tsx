import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, matchPath, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/shared/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarTrigger,
  SidebarFooter,
  useSidebar,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarMenuSkeleton,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarSeparator,
} from "@/shared/ui/sidebar";
import { AppLogo } from "@/shared/components/AppLogo";
import {
  ChevronDown,
  CornerDownRight,
  File as FileIcon,
  FileText,
  Files,
  FolderOpen,
  Home,
  ImageIcon,
  Library,
  MessageSquare,
  MoreHorizontal,
  Sparkles,
  Video,
} from "lucide-react";
import { AnimatePresence, m } from "framer-motion";
import { useAuth } from "@/app/providers/AuthProvider";
import { useMaterials } from "@/app/providers/MaterialProvider";
import { useChatDock } from "@/app/providers/ChatDockProvider";
import { usePaths } from "@/app/providers/PathProvider";
import { useLessons } from "@/app/providers/LessonProvider";
import type { MaterialFile, Path, PathNode } from "@/shared/types/models";
import { cn } from "@/shared/lib/utils";
import { clampPct, stageLabel } from "@/shared/lib/learningBuildStages";
import { nbTransitions } from "@/shared/motion/presets";
import { UserAvatar } from "@/features/user/components/UserAvatar";
import { generatePathCover, listNodesForPath } from "@/shared/api/PathService";
import { listChatThreads } from "@/shared/api/ChatService";
import { queryKeys } from "@/shared/query/queryKeys";
import { AVATAR_COLORS } from "@/features/user/components/ColorPicker";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/shared/ui/tooltip";
import { getAccessToken } from "@/shared/services/StorageService";
import { useI18n } from "@/app/providers/I18nProvider";
import { Skeleton } from "@/shared/ui/skeleton";

type JsonRecord = Record<string, unknown>;

const SIDEBAR_YOUR_PATHS_OPEN_KEY = "nb:sidebar:your_paths_open";
const SIDEBAR_YOUR_LESSONS_OPEN_KEY = "nb:sidebar:your_lessons_open";
const SIDEBAR_YOUR_FILES_OPEN_KEY = "nb:sidebar:your_files_open";
const SIDEBAR_YOUR_CHATS_OPEN_KEY = "nb:sidebar:your_chats_open";

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeParseJSON(value: unknown): JsonRecord | null {
  if (!value) return null;
  if (isRecord(value)) return value;
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function nodeContentState(node: PathNode | null | undefined): string {
  if (!node) return "";
  const availability = String(node.availabilityStatus || "").trim().toLowerCase();
  if (availability === "building" || availability === "listed_not_ready" || availability === "locked") {
    return "pending";
  }
  if (availability === "blocked") return "blocked";
  if (availability === "available" || availability === "soft_remediate") return "ready";
  const meta = safeParseJSON(node.metadata) ?? (node.metadata as JsonRecord | null) ?? null;
  if (!meta) return "";
  const raw = (meta["content_state"] ?? meta["contentState"] ?? "") as string;
  return String(raw || "").toLowerCase();
}

function readStoredBool(key: string): boolean | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(key);
    if (v === "1" || v === "true") return true;
    if (v === "0" || v === "false") return false;
    return null;
  } catch {
    return null;
  }
}

function writeStoredBool(key: string, value: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value ? "1" : "0");
  } catch {
    // ignore
  }
}

function getMeta(path: Path | null | undefined): JsonRecord {
  const m = path?.metadata;
  if (!m) return {};
  if (isRecord(m)) return m;
  if (typeof m === "string") {
    try {
      const parsed = JSON.parse(m);
      return isRecord(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function pathLabel(path: Path | null | undefined) {
  const meta = getMeta(path);
  const label = (meta as { short_title?: string; shortTitle?: string }).short_title
    || (meta as { short_title?: string; shortTitle?: string }).shortTitle;
  return label || path?.title || "Path";
}

function getCoverImageUrlFromMeta(meta: JsonRecord | null | undefined): string | null {
  if (!meta) return null;
  const cover = meta["cover_image"];
  if (isRecord(cover)) {
    const url = cover["url"];
    if (typeof url === "string" && url.trim()) return url.trim();
  }
  const flatUrl = meta["cover_image_url"];
  if (typeof flatUrl === "string" && flatUrl.trim()) return flatUrl.trim();
  const camelUrl = meta["coverImageUrl"];
  if (typeof camelUrl === "string" && camelUrl.trim()) return camelUrl.trim();
  return null;
}

function getPathAvatarUrl(path: Path | null | undefined): string | null {
  if (!path) return null;
  if (typeof path.avatarUrl === "string" && path.avatarUrl.trim()) {
    return path.avatarUrl.trim();
  }
  if (typeof path.avatarSquareUrl === "string" && path.avatarSquareUrl.trim()) {
    return path.avatarSquareUrl.trim();
  }
  return getCoverImageUrlFromMeta(getMeta(path));
}

function pickPathColor(seed: string): string {
  if (!seed) return AVATAR_COLORS[0];
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % AVATAR_COLORS.length;
  return AVATAR_COLORS[index];
}

function getLessonAvatarUrl(node: PathNode | null | undefined): string | null {
  if (!node) return null;
  if (typeof node.avatarSquareUrl === "string" && node.avatarSquareUrl.trim()) {
    return node.avatarSquareUrl.trim();
  }
  if (typeof node.avatarUrl === "string" && node.avatarUrl.trim()) {
    return node.avatarUrl.trim();
  }
  return null;
}

function buildProgressState(path: Path | null | undefined) {
  const jobStatus = String(path?.jobStatus || "").toLowerCase();
  const jobStage = String(path?.jobStage || "");
  const showGen = Boolean(
    path?.jobId ||
      path?.jobStatus ||
      path?.jobStage ||
      typeof path?.jobProgress === "number" ||
      path?.jobMessage
  );
  const isFailed = showGen && jobStatus === "failed";
  const isCanceled = showGen && jobStatus === "canceled";
  const isDone =
    showGen && (jobStatus === "succeeded" || jobStatus === "success" || stageLabel(jobStage) === "Done");
  const showProgress = showGen && !isFailed && !isDone && !isCanceled;
  return { showProgress, progressPct: showProgress ? clampPct(path?.jobProgress) : 0 };
}

function fileLabel(file: MaterialFile | null | undefined) {
  return file?.originalName || "Untitled file";
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

function ProgressRing({
  progress,
  size,
  strokeWidth = 3,
  className,
}: {
  progress: number | string | null | undefined;
  size: number;
  strokeWidth?: number;
  className?: string;
}) {
  const pct = clampPct(progress);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (pct / 100) * circumference;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={cn("-rotate-90", className)}
      aria-hidden="true"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        className="text-muted"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={strokeDashoffset}
        strokeLinecap="round"
        className="text-primary transition-[stroke-dashoffset] nb-duration nb-ease-out motion-reduce:transition-none"
      />
    </svg>
  );
}

export function AppSideBar() {
  const { state, useSheet, openMobile, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";

  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { t } = useI18n();
  const { files: materialFiles, loading: materialFilesLoading } = useMaterials();
  const { openThread: openChatDockThread } = useChatDock();
  const {
    paths,
    loading: pathsLoading,
    reload,
    activePathId,
    activePath: activePathFromProvider,
    activatePath,
    clearActivePath,
  } = usePaths();
  const { activateLesson, clearActiveLesson } = useLessons();
  const [coverLoadingId, setCoverLoadingId] = useState<string | null>(null);
  const [actionHoverId, setActionHoverId] = useState<string | null>(null);
  const [fileThumbErrors, setFileThumbErrors] = useState<Record<string, boolean>>({});
  const lastNormalRouteRef = useRef<string>("/");

  const [yourPathsOpen, setYourPathsOpen] = useState(() => readStoredBool(SIDEBAR_YOUR_PATHS_OPEN_KEY) ?? true);
  const [yourLessonsOpen, setYourLessonsOpen] = useState(() => readStoredBool(SIDEBAR_YOUR_LESSONS_OPEN_KEY) ?? true);
  const [yourFilesOpen, setYourFilesOpen] = useState(() => readStoredBool(SIDEBAR_YOUR_FILES_OPEN_KEY) ?? true);
  const [yourChatsOpen, setYourChatsOpen] = useState(() => readStoredBool(SIDEBAR_YOUR_CHATS_OPEN_KEY) ?? true);

  useEffect(() => {
    writeStoredBool(SIDEBAR_YOUR_PATHS_OPEN_KEY, yourPathsOpen);
  }, [yourPathsOpen]);

  useEffect(() => {
    writeStoredBool(SIDEBAR_YOUR_LESSONS_OPEN_KEY, yourLessonsOpen);
  }, [yourLessonsOpen]);

  useEffect(() => {
    writeStoredBool(SIDEBAR_YOUR_FILES_OPEN_KEY, yourFilesOpen);
  }, [yourFilesOpen]);

  useEffect(() => {
    writeStoredBool(SIDEBAR_YOUR_CHATS_OPEN_KEY, yourChatsOpen);
  }, [yourChatsOpen]);

  const showFooterName = useSheet ? openMobile : !isCollapsed;

  const sidebarGhost =
    "rounded-xl text-sidebar-foreground/80 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground";
  const sidebarShortcut = "Cmd/Ctrl+B";
  const homeShortcut = "Cmd/Ctrl+1";
  const pathsShortcut = "Cmd/Ctrl+2";
  const filesShortcut = "Cmd/Ctrl+3";
  const apiBase = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");

  const buildFileViewUrl = (fileId: string) => {
    const token = getAccessToken();
    const baseUrl = `${apiBase}/material-files/${fileId}/view`;
    return token ? `${baseUrl}?token=${encodeURIComponent(token)}` : baseUrl;
  };

  const buildFileThumbnailUrl = (fileId: string, version?: string | null) => {
    const token = getAccessToken();
    const baseUrl = `${apiBase}/material-files/${fileId}/thumbnail`;
    const url = token ? `${baseUrl}?token=${encodeURIComponent(token)}` : baseUrl;
    return version ? `${url}${url.includes("?") ? "&" : "?"}v=${encodeURIComponent(version)}` : url;
  };

  const activeTab = useMemo(() => {
    const path = location.pathname;
    if (matchPath({ path: "/paths", end: false }, path)) return "paths";
    if (matchPath({ path: "/paths/:id", end: false }, path)) return "paths";
    if (matchPath({ path: "/activities/:id", end: false }, path)) return "paths";
    if (matchPath({ path: "/files", end: false }, path)) return "files";
    if (path === "/") return "home";
    return "home";
  }, [location.pathname]);

  const currentThreadId = useMemo(() => {
    const m = matchPath({ path: "/chat/threads/:id", end: false }, location.pathname);
    return m?.params?.id ? String(m.params.id) : null;
  }, [location.pathname]);

  const pathIdFromRoute = useMemo(() => {
    const p = location.pathname;
    if (matchPath({ path: "/paths/build/:jobId", end: false }, p)) return null;
    const m = matchPath({ path: "/paths/:id", end: false }, p);
    return m?.params?.id ? String(m.params.id) : null;
  }, [location.pathname]);

  const currentPathId = useMemo(() => {
    const m = matchPath({ path: "/paths/:id", end: true }, location.pathname);
    return m?.params?.id || null;
  }, [location.pathname]);

  const sortedPaths = useMemo(() => {
    const list = Array.isArray(paths) ? paths.slice() : [];
    list.sort((a, b) => {
      const ad = new Date(a?.updatedAt || a?.createdAt || 0).getTime();
      const bd = new Date(b?.updatedAt || b?.createdAt || 0).getTime();
      return bd - ad;
    });
    return list;
  }, [paths]);

  const realPaths = useMemo(() => {
    return (sortedPaths || []).filter((p) => !String(p?.id || "").startsWith("job:"));
  }, [sortedPaths]);

  const generatingPaths = useMemo(() => {
    return (sortedPaths || []).filter((p) => buildProgressState(p).showProgress);
  }, [sortedPaths]);

  const generatingPathIds = useMemo(() => {
    return new Set((generatingPaths || []).map((p) => String(p?.id || "")));
  }, [generatingPaths]);

  const nonGeneratingRealPaths = useMemo(() => {
    if (!realPaths?.length) return [];
    if (generatingPathIds.size === 0) return realPaths;
    return realPaths.filter((p) => !generatingPathIds.has(String(p?.id || "")));
  }, [generatingPathIds, realPaths]);

  const hasAnySidebarPaths = generatingPaths.length > 0 || nonGeneratingRealPaths.length > 0;

  const pathContextPathId = activePathId || pathIdFromRoute;
  const isPathMode = Boolean(pathContextPathId);

  const activePath = useMemo(() => {
    if (!pathContextPathId) return null;
    if (
      activePathFromProvider?.id &&
      String(activePathFromProvider.id) === String(pathContextPathId)
    ) {
      return activePathFromProvider;
    }
    return realPaths.find((p) => String(p?.id || "") === String(pathContextPathId)) ?? null;
  }, [activePathFromProvider, pathContextPathId, realPaths]);

  const activeBuild = useMemo(() => buildProgressState(activePath), [activePath]);

  useEffect(() => {
    // Track last "normal" nav tab so the path switcher can return to it.
    if (isPathMode) return;
    const p = location.pathname;
    if (p === "/") lastNormalRouteRef.current = "/";
    else if (matchPath({ path: "/paths", end: true }, p)) lastNormalRouteRef.current = "/paths";
    else if (matchPath({ path: "/files", end: false }, p)) lastNormalRouteRef.current = "/files";
  }, [isPathMode, location.pathname]);

  const lessonsQuery = useQuery({
    queryKey: queryKeys.pathNodes(String(pathContextPathId || "")),
    enabled: Boolean(isAuthenticated && !isCollapsed && pathContextPathId),
    staleTime: 60_000,
    queryFn: () => listNodesForPath(String(pathContextPathId)),
    select: (nodes) => (nodes || []).slice().sort((a, b) => (a.index ?? 0) - (b.index ?? 0)),
  });

  const lessons = lessonsQuery.data ?? [];
  const lessonsLoading = Boolean(lessonsQuery.isPending);

  const lessonRows = useMemo(() => {
    const list = Array.isArray(lessons) ? lessons.slice() : [];
    if (list.length === 0) return [] as Array<{ node: PathNode; depth: number; hasChildren: boolean }>;

    const byId = new Map<string, PathNode>();
    list.forEach((n) => {
      if (n?.id) byId.set(String(n.id), n);
    });

    const childrenByParent = new Map<string, PathNode[]>();
    const roots: PathNode[] = [];
    list.forEach((n) => {
      const parentId = n?.parentNodeId ? String(n.parentNodeId) : "";
      if (parentId && byId.has(parentId)) {
        const arr = childrenByParent.get(parentId) ?? [];
        arr.push(n);
        childrenByParent.set(parentId, arr);
      } else {
        roots.push(n);
      }
    });
    for (const arr of childrenByParent.values()) {
      arr.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    }
    roots.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));

    const rows: Array<{ node: PathNode; depth: number; hasChildren: boolean }> = [];
    const seen = new Set<string>();
    const walk = (node: PathNode, depth: number) => {
      const id = String(node?.id || "");
      if (!id || seen.has(id)) return;
      seen.add(id);
      const children = childrenByParent.get(id) ?? [];
      rows.push({ node, depth, hasChildren: children.length > 0 });
      children.forEach((c) => walk(c, Math.min(depth + 1, 6)));
    };
    roots.forEach((r) => walk(r, 0));

    return rows;
  }, [lessons]);

  const chatThreadsLimit = isPathMode ? 60 : 30;
  const chatThreadsQuery = useQuery({
    queryKey: queryKeys.chatThreads({ limit: chatThreadsLimit }),
    enabled: Boolean(isAuthenticated && !isCollapsed),
    staleTime: 15_000,
    queryFn: () => listChatThreads(chatThreadsLimit),
  });

  const chatThreadsLoading = Boolean(chatThreadsQuery.isPending);
  const chatThreads = useMemo(() => {
    const threads = Array.isArray(chatThreadsQuery.data) ? chatThreadsQuery.data : [];
    const filtered = isPathMode
      ? threads.filter((t) => String(t?.pathId || "") === String(pathContextPathId || ""))
      : threads;
    return filtered.map((t) => ({
      id: String(t.id),
      title: String(t.title || "").trim() || "Chat",
    }));
  }, [chatThreadsQuery.data, isPathMode, pathContextPathId]);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (!pathIdFromRoute) return;
    if (String(activePathId || "") === String(pathIdFromRoute)) return;
    void activatePath(String(pathIdFromRoute)).catch((err) => {
      console.warn("[AppSideBar] Failed to activate path from route:", err);
    });
  }, [activePathId, activatePath, isAuthenticated, pathIdFromRoute]);

  const visibleFiles = useMemo(() => materialFiles || [], [materialFiles]);
  const pathFiles = useMemo(() => {
    if (!isPathMode) return [];
    const materialSetId = String(activePath?.materialSetId || "");
    if (!materialSetId) return [];
    return visibleFiles.filter((f) => String(f?.materialSetId || "") === materialSetId);
  }, [activePath?.materialSetId, isPathMode, visibleFiles]);

  const handleGenerateCover = async (path: Path, force: boolean) => {
    if (!path?.id) return;
    setCoverLoadingId(String(path.id));
    try {
      await generatePathCover(String(path.id), force);
      await reload();
    } catch (err) {
      console.error("[AppSideBar] Failed to generate path cover:", err);
    } finally {
      setCoverLoadingId(null);
    }
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="h-16 px-3 flex items-center">
        {isCollapsed ? (
          <div className="flex w-full items-center justify-center">
            {isPathMode ? (
              <div className="group relative shrink-0 min-w-max">
                <div className="transition-opacity duration-150 opacity-100 group-hover:opacity-0">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className={sidebarGhost}
                        aria-label={`Open sidebar (${pathLabel(activePath)})`}
                        onClick={() => toggleSidebar()}
                      >
                        <span
                          className={cn(
                            "flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full",
                            activeBuild.showProgress ? "" : "border border-border/60 bg-muted/40"
                          )}
                          style={
                            activeBuild.showProgress || getPathAvatarUrl(activePath)
                              ? undefined
                              : { backgroundColor: pickPathColor(String(activePath?.id || pathContextPathId || "")) }
                          }
                          aria-hidden="true"
                        >
                          {activeBuild.showProgress ? (
                            <ProgressRing size={28} progress={activeBuild.progressPct} strokeWidth={3} />
                          ) : getPathAvatarUrl(activePath) ? (
                            <img
                              src={getPathAvatarUrl(activePath) as string}
                              alt=""
                              loading="lazy"
                              decoding="async"
                              className="h-full w-full object-cover"
                            />
                          ) : null}
                        </span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="right" shortcut={sidebarShortcut}>
                      {pathLabel(activePath)}
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="absolute inset-0 flex items-center justify-center opacity-0 pointer-events-none transition-opacity duration-150 group-hover:opacity-100 group-hover:pointer-events-auto">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" className={sidebarGhost} asChild>
                        <SidebarTrigger aria-label={t("sidebar.expand")} style={{ cursor: "e-resize" }} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="right" shortcut={sidebarShortcut}>
                      {t("sidebar.expand")}
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>
            ) : (
              <div className="group relative shrink-0 min-w-max">
                <div className="transition-opacity duration-150 opacity-100 group-hover:opacity-0">
                    <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" className={sidebarGhost} asChild aria-label={t("nav.goHome")}>
                        <div className="flex items-center justify-center">
                          <AppLogo className="shrink-0" />
                        </div>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="right" shortcut={homeShortcut}>Neurobridge</TooltipContent>
                  </Tooltip>
                </div>
                <div className="absolute inset-0 flex items-center justify-center opacity-0 pointer-events-none transition-opacity duration-150 group-hover:opacity-100 group-hover:pointer-events-auto">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" className={sidebarGhost} asChild>
                        <SidebarTrigger aria-label={t("sidebar.expand")} style={{ cursor: "e-resize" }} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="right" shortcut={sidebarShortcut}>
                      {t("sidebar.expand")}
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex w-full items-center justify-between">
            {isPathMode ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className={sidebarGhost}
                    aria-label={t("sidebar.switchPath.aria", { title: pathLabel(activePath) })}
                  >
                    <div className="flex items-center justify-center" style={{ cursor: "pointer" }}>
                      <span
                        className={cn(
                          "flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full",
                          activeBuild.showProgress ? "" : "border border-border/60 bg-muted/40"
                        )}
                        style={
                          activeBuild.showProgress || getPathAvatarUrl(activePath)
                            ? undefined
                            : { backgroundColor: pickPathColor(String(activePath?.id || pathContextPathId || "")) }
                        }
                        aria-hidden="true"
                      >
                        {activeBuild.showProgress ? (
                          <ProgressRing size={28} progress={activeBuild.progressPct} strokeWidth={3} />
                        ) : getPathAvatarUrl(activePath) ? (
                          <img
                            src={getPathAvatarUrl(activePath) as string}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            className="h-full w-full object-cover"
                          />
                        ) : null}
                      </span>
                    </div>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  side="bottom"
                  className="w-[264px] overflow-hidden p-2"
                >
                  <div className="px-2 pb-2 text-xs font-medium text-muted-foreground">
                    {t("sidebar.switchPath")}
                  </div>
                  <div className="scrollbar-none grid max-h-[240px] grid-cols-5 justify-items-center gap-2 overflow-y-auto px-1 pb-1">
                    <DropdownMenuItem
                      className="h-12 w-12 justify-center rounded-2xl p-0"
                      onSelect={() => {
                        clearActiveLesson();
                        clearActivePath();
                        navigate(lastNormalRouteRef.current || "/");
                      }}
                      aria-label={t("nav.goHome")}
                    >
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border/60 bg-muted/20 shadow-sm">
                            <AppLogo className="h-6 w-6" />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="right">Neurobridge</TooltipContent>
                      </Tooltip>
                    </DropdownMenuItem>
                    {realPaths
                      .filter((p) => String(p?.id || "") !== String(pathContextPathId || ""))
                      .map((p) => {
                        const coverUrl = getPathAvatarUrl(p);
                        const fallbackColor = pickPathColor(String(p?.id || p?.title || ""));
                        const name = pathLabel(p);
                        return (
                          <DropdownMenuItem
                            key={p.id}
                            className="h-12 w-12 justify-center rounded-2xl p-0"
                            onSelect={() => {
                              clearActiveLesson();
                              void activatePath(String(p.id)).catch((err) => {
                                console.warn("[AppSideBar] Failed to activate path:", err);
                              });
                              navigate(`/paths/${p.id}`);
                            }}
                            aria-label={t("sidebar.switchTo", { title: name })}
                          >
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div
                                  className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-border/60 bg-muted/40 shadow-sm"
                                  style={coverUrl ? undefined : { backgroundColor: fallbackColor }}
                                >
                                  {coverUrl ? (
                                    <img
                                      src={coverUrl}
                                      alt=""
                                      loading="lazy"
                                      decoding="async"
                                      className="h-full w-full object-cover"
                                    />
                                  ) : null}
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="right">{name}</TooltipContent>
                            </Tooltip>
                          </DropdownMenuItem>
                        );
                      })}
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
                <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className={sidebarGhost} asChild aria-label={t("nav.goHome")}>
                    <div className="flex items-center justify-center" style={{ cursor: "pointer" }}>
                      <AppLogo className="shrink-0" />
                    </div>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" shortcut={homeShortcut}>Neurobridge</TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className={sidebarGhost} asChild>
                  <SidebarTrigger
                    aria-label={t("sidebar.collapse")}
                    style={{ cursor: "w-resize" }}
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" shortcut={sidebarShortcut}>
                {t("sidebar.collapse")}
              </TooltipContent>
            </Tooltip>
          </div>
        )}
      </SidebarHeader>

      <SidebarContent className={cn("pb-4 nb-scrollbar-sidebar", isCollapsed ? "px-0" : "px-3")}>
        {isPathMode ? (
          isCollapsed ? null : (
            <>
              <SidebarGroup className="px-0 pt-4">
                <SidebarGroupLabel asChild>
                  <button
                    type="button"
                    aria-expanded={yourLessonsOpen}
                    aria-controls="sidebar-your-lessons"
                    onClick={() => setYourLessonsOpen((v) => !v)}
                    className="w-full gap-1.5 hover:bg-sidebar-accent/50 active:bg-sidebar-accent/60"
                  >
                    <span>{t("sidebar.yourLessons")}</span>
                    <ChevronDown
                      aria-hidden="true"
                      className={cn(
                        "transition-transform nb-duration-micro nb-ease-out motion-reduce:transition-none",
                        yourLessonsOpen ? "rotate-0" : "-rotate-90"
                      )}
                    />
                  </button>
                </SidebarGroupLabel>

                <AnimatePresence initial={false}>
                  {yourLessonsOpen ? (
                    <m.div
                      key="sidebar-your-lessons"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{
                        height: "auto",
                        opacity: 1,
                        transition: nbTransitions.default,
                      }}
                      exit={{ height: 0, opacity: 0, transition: nbTransitions.micro }}
                      style={{ overflow: "hidden" }}
                    >
                      <SidebarMenuSub
                        id="sidebar-your-lessons"
                        className="gap-2.5 mx-0 border-l-0 px-0 py-0"
                      >
                        {lessonsLoading && lessons.length === 0 ? (
                          Array.from({ length: 6 }).map((_, i) => (
                            <SidebarMenuSubItem key={`lesson-skel:${i}`}>
                              <SidebarMenuSkeleton showIcon />
                            </SidebarMenuSubItem>
                          ))
                        ) : lessons.length === 0 ? (
                          <SidebarMenuSubItem>
                            <div className="px-3 py-2 text-xs text-sidebar-foreground/50">
                              {t("sidebar.emptyLessons")}
                            </div>
                          </SidebarMenuSubItem>
                        ) : (
                          lessonRows.map(({ node: n, depth, hasChildren }) => {
                            const avatarUrl = getLessonAvatarUrl(n);
                            const fallbackColor = pickPathColor(String(n?.id || n?.title || ""));
                            const isActive =
                              matchPath({ path: `/path-nodes/${n.id}`, end: false }, location.pathname) != null;
                            const contentState = nodeContentState(n);
                            const availability = String(n?.availabilityStatus || "").trim().toLowerCase();
                            const isPending = contentState === "pending";
                            const isBlocked = contentState === "blocked" || availability === "locked";
                            const href = isPending || isBlocked ? null : `/path-nodes/${n.id}`;
                            const indent = Math.min(depth, 4) * 14;
                            const showAvatarSkeleton = Boolean(activeBuild.showProgress && !hasChildren && !avatarUrl);
                            return (
                              <SidebarMenuSubItem key={n.id}>
                                <div className="flex w-full items-center gap-1 rounded-xl nb-motion-fast motion-reduce:transition-none hover:bg-sidebar-accent/70">
                                  <SidebarMenuSubButton
                                    asChild
                                    isActive={isActive}
                                    aria-disabled={isPending || isBlocked || !href}
                                    className={cn(
                                      "flex-1 pe-2 hover:bg-transparent hover:text-sidebar-foreground group-hover/menu-sub-item:text-sidebar-accent-foreground",
                                      (isPending || isBlocked) && "opacity-50 cursor-default"
                                    )}
                                  >
                                    {href ? (
                                      <Link
                                        to={href}
                                        aria-label={`Open ${n.title || "lesson"}`}
                                        onClick={() => {
                                          if (isPending) return;
                                          void activateLesson(String(n.id)).catch((err) => {
                                            console.warn("[AppSideBar] Failed to activate lesson:", err);
                                          });
                                        }}
                                      >
                                        {indent > 0 ? (
                                          <span
                                            aria-hidden="true"
                                            className="flex shrink-0 items-center justify-end text-sidebar-foreground/50"
                                            style={{ width: indent }}
                                          >
                                            <CornerDownRight className="h-3.5 w-3.5" />
                                          </span>
                                        ) : null}
                                        {showAvatarSkeleton ? (
                                          <Skeleton className="h-5 w-5 shrink-0 rounded-full border border-border/60" />
                                        ) : (
                                          <span
                                            className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border/60 bg-muted/40"
                                            style={avatarUrl ? undefined : { backgroundColor: fallbackColor }}
                                            aria-hidden="true"
                                          >
                                            {avatarUrl ? (
                                              <img
                                                src={avatarUrl}
                                                alt=""
                                                loading="lazy"
                                                decoding="async"
                                                className="h-full w-full object-cover"
                                              />
                                            ) : hasChildren ? (
                                              <FolderOpen className="h-3.5 w-3.5 text-white/80" />
                                            ) : null}
                                          </span>
                                        )}
                                        <span className="truncate">{n.title || "Lesson"}</span>
                                        {availability === "soft_remediate" ? (
                                          <span className="ms-1 rounded-full border border-border/60 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-sidebar-foreground/80">
                                            Soft
                                          </span>
                                        ) : null}
                                      </Link>
                                    ) : (
                                      <div className="flex min-w-0 flex-1 items-center gap-2">
                                        {indent > 0 ? (
                                          <span
                                            aria-hidden="true"
                                            className="flex shrink-0 items-center justify-end text-sidebar-foreground/50"
                                            style={{ width: indent }}
                                          >
                                            <CornerDownRight className="h-3.5 w-3.5" />
                                          </span>
                                        ) : null}
                                        {showAvatarSkeleton ? (
                                          <Skeleton className="h-5 w-5 shrink-0 rounded-full border border-border/60" />
                                        ) : (
                                          <span
                                            className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border/60 bg-muted/40"
                                            style={avatarUrl ? undefined : { backgroundColor: fallbackColor }}
                                            aria-hidden="true"
                                          >
                                            {avatarUrl ? (
                                              <img
                                                src={avatarUrl}
                                                alt=""
                                                loading="lazy"
                                                decoding="async"
                                                className="h-full w-full object-cover"
                                              />
                                            ) : hasChildren ? (
                                              <FolderOpen className="h-3.5 w-3.5 text-white/80" />
                                            ) : null}
                                          </span>
                                        )}
                                        <span className="truncate">{n.title || "Lesson"}</span>
                                        {isBlocked ? (
                                          <span className="rounded-full border border-sidebar-border/60 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-sidebar-foreground/70">
                                            Blocked
                                          </span>
                                        ) : null}
                                      </div>
                                    )}
                                  </SidebarMenuSubButton>
                                </div>
                              </SidebarMenuSubItem>
                            );
                          })
                        )}
                      </SidebarMenuSub>
                    </m.div>
                  ) : null}
                </AnimatePresence>
              </SidebarGroup>

              <SidebarGroup className="px-0">
                <SidebarGroupLabel asChild>
                  <button
                    type="button"
                    aria-expanded={yourFilesOpen}
                    aria-controls="sidebar-your-files"
                    onClick={() => setYourFilesOpen((v) => !v)}
                    className="w-full gap-1.5 hover:bg-sidebar-accent/50 active:bg-sidebar-accent/60"
                  >
                    <span>{t("sidebar.yourFiles")}</span>
                    <ChevronDown
                      aria-hidden="true"
                      className={cn(
                        "transition-transform nb-duration-micro nb-ease-out motion-reduce:transition-none",
                        yourFilesOpen ? "rotate-0" : "-rotate-90"
                      )}
                    />
                  </button>
                </SidebarGroupLabel>

                <AnimatePresence initial={false}>
                  {yourFilesOpen ? (
                    <m.div
                      key="sidebar-your-files"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{
                        height: "auto",
                        opacity: 1,
                        transition: nbTransitions.default,
                      }}
                      exit={{ height: 0, opacity: 0, transition: nbTransitions.micro }}
                      style={{ overflow: "hidden" }}
                    >
                      <SidebarMenuSub
                        id="sidebar-your-files"
                        className="gap-2.5 mx-0 border-l-0 px-0 py-0"
                      >
                        {materialFilesLoading && pathFiles.length === 0 ? (
                          Array.from({ length: 6 }).map((_, i) => (
                            <SidebarMenuSubItem key={`file-skel:${i}`}>
                              <SidebarMenuSkeleton showIcon />
                            </SidebarMenuSubItem>
                          ))
                        ) : pathFiles.length === 0 ? (
                          <SidebarMenuSubItem>
                            <div className="px-3 py-2 text-xs text-sidebar-foreground/50">
                              No files for this path yet
                            </div>
                          </SidebarMenuSubItem>
                        ) : (
                          pathFiles.map((file) => {
                            const Icon = fileIcon(file);
                            const label = fileLabel(file);
                            const thumbVersion = String(file?.updatedAt || file?.createdAt || "");
                            const thumbUrl = buildFileThumbnailUrl(file.id, thumbVersion);
                            const thumbKey = `${file.id}:${thumbVersion}`;
                            const showThumb = Boolean(thumbUrl) && !fileThumbErrors[thumbKey];
                            const actionKey = `file:${file.id}`;
                            const isActionHover = actionHoverId === actionKey;
                            return (
                              <SidebarMenuSubItem
                                key={file.id}
                                style={{ contentVisibility: "auto", containIntrinsicSize: "44px" }}
                              >
                                <div
                                  className={cn(
                                    "flex w-full items-center gap-1 rounded-xl nb-motion-fast motion-reduce:transition-none",
                                    isActionHover ? "hover:bg-transparent" : "hover:bg-sidebar-accent/70"
                                  )}
                                >
                                  <SidebarMenuSubButton
                                    asChild
                                    className={cn(
                                      "flex-1 pe-2 hover:bg-transparent hover:text-sidebar-foreground",
                                      !isActionHover && "group-hover/menu-sub-item:text-sidebar-accent-foreground"
                                    )}
                                  >
                                    <a
                                      href={buildFileViewUrl(file.id)}
                                      target="_blank"
                                      rel="noreferrer"
                                      aria-label={`Open ${label}`}
                                    >
                                      <span className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border/60 bg-muted/40 text-muted-foreground">
                                        {showThumb ? (
                                          <img
                                            src={thumbUrl}
                                            alt=""
                                            loading="lazy"
                                            decoding="async"
                                            className="h-full w-full object-cover"
                                            onError={() => {
                                              setFileThumbErrors((prev) => ({ ...prev, [thumbKey]: true }));
                                            }}
                                          />
                                        ) : (
                                          <Icon className="h-4 w-4" />
                                        )}
                                      </span>
                                      <span className="truncate">{label}</span>
                                    </a>
                                  </SidebarMenuSubButton>
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className={cn(
                                          "h-8 w-8 rounded-lg text-sidebar-foreground/70",
                                          "pointer-events-none opacity-0",
                                          "group-hover/menu-sub-item:pointer-events-auto group-hover/menu-sub-item:opacity-100",
                                          "group-focus-within/menu-sub-item:pointer-events-auto group-focus-within/menu-sub-item:opacity-100",
                                          "hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground"
                                        )}
                                        aria-label={`Open file actions for ${label}`}
                                        onMouseEnter={() => setActionHoverId(actionKey)}
                                        onMouseLeave={() => setActionHoverId(null)}
                                        onFocus={() => setActionHoverId(actionKey)}
                                        onBlur={() => setActionHoverId(null)}
                                      >
                                        <MoreHorizontal className="h-4 w-4" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" side="right" className="w-56">
                                      <DropdownMenuItem
                                        onSelect={() => {
                                          const url = buildFileViewUrl(file.id);
                                          window.open(url, "_blank", "noopener,noreferrer");
                                        }}
                                        className="gap-2"
                                      >
                                        <FileIcon className="h-4 w-4" />
                                        Open file
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </div>
                              </SidebarMenuSubItem>
                            );
                          })
                        )}
                      </SidebarMenuSub>
                    </m.div>
                  ) : null}
                </AnimatePresence>
              </SidebarGroup>

              <SidebarGroup className="px-0">
                <SidebarGroupLabel asChild>
                  <button
                    type="button"
                    aria-expanded={yourChatsOpen}
                    aria-controls="sidebar-your-chats"
                    onClick={() => setYourChatsOpen((v) => !v)}
                    className="w-full gap-1.5 hover:bg-sidebar-accent/50 active:bg-sidebar-accent/60"
                  >
                    <span>{t("sidebar.yourChats")}</span>
                    <ChevronDown
                      aria-hidden="true"
                      className={cn(
                        "transition-transform nb-duration-micro nb-ease-out motion-reduce:transition-none",
                        yourChatsOpen ? "rotate-0" : "-rotate-90"
                      )}
                    />
                  </button>
                </SidebarGroupLabel>

                <AnimatePresence initial={false}>
                  {yourChatsOpen ? (
                    <m.div
                      key="sidebar-your-chats"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{
                        height: "auto",
                        opacity: 1,
                        transition: nbTransitions.default,
                      }}
                      exit={{ height: 0, opacity: 0, transition: nbTransitions.micro }}
                      style={{ overflow: "hidden" }}
                    >
                      <SidebarMenuSub
                        id="sidebar-your-chats"
                        className="gap-2.5 mx-0 border-l-0 px-0 py-0"
                      >
                        {chatThreadsLoading && chatThreads.length === 0 ? (
                          Array.from({ length: 6 }).map((_, i) => (
                            <SidebarMenuSubItem key={`chat-skel:${i}`}>
                              <SidebarMenuSkeleton showIcon />
                            </SidebarMenuSubItem>
                          ))
                        ) : chatThreads.length === 0 ? (
                          <SidebarMenuSubItem>
                            <div className="px-3 py-2 text-xs text-sidebar-foreground/50">
                              No chats for this path yet
                            </div>
                          </SidebarMenuSubItem>
                        ) : (
                          chatThreads.map((thread) => {
                            const isActive = currentThreadId != null && String(currentThreadId) === String(thread.id);
                            const actionKey = `chat:${thread.id}`;
                            const isActionHover = actionHoverId === actionKey;
                            return (
                              <SidebarMenuSubItem
                                key={thread.id}
                                style={{ contentVisibility: "auto", containIntrinsicSize: "44px" }}
                              >
                                <div
                                  className={cn(
                                    "flex w-full items-center gap-1 rounded-xl nb-motion-fast motion-reduce:transition-none",
                                    isActionHover ? "hover:bg-transparent" : "hover:bg-sidebar-accent/70"
                                  )}
                                >
                                  <SidebarMenuSubButton
                                    asChild
                                    isActive={isActive}
                                    className={cn(
                                      "flex-1 pe-2 hover:bg-transparent hover:text-sidebar-foreground",
                                      !isActionHover && "group-hover/menu-sub-item:text-sidebar-accent-foreground",
                                      isActionHover && "data-[active=true]:bg-transparent data-[active=true]:text-sidebar-foreground"
                                    )}
                                    >
                                    <Link
                                      to={`/chat/threads/${thread.id}`}
                                      aria-label={t("sidebar.chats.open", { title: thread.title })}
                                      onClick={(event) => {
                                        if (!isPathMode) return;
                                        event.preventDefault();
                                        openChatDockThread(String(thread.id));
                                      }}
                                    >
                                      <span className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border/60 bg-muted/40 text-muted-foreground">
                                        <MessageSquare className="h-4 w-4" />
                                      </span>
                                      <span className="truncate">{thread.title}</span>
                                    </Link>
                                  </SidebarMenuSubButton>
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className={cn(
                                          "h-8 w-8 rounded-lg text-sidebar-foreground/70",
                                          "pointer-events-none opacity-0",
                                          "group-hover/menu-sub-item:pointer-events-auto group-hover/menu-sub-item:opacity-100",
                                          "group-focus-within/menu-sub-item:pointer-events-auto group-focus-within/menu-sub-item:opacity-100",
                                          "hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground"
                                        )}
                                        aria-label={t("sidebar.chats.actions", { title: thread.title })}
                                        onMouseEnter={() => setActionHoverId(actionKey)}
                                        onMouseLeave={() => setActionHoverId(null)}
                                        onFocus={() => setActionHoverId(actionKey)}
                                        onBlur={() => setActionHoverId(null)}
                                      >
                                        <MoreHorizontal className="h-4 w-4" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end" side="right" className="w-56">
                                        <DropdownMenuItem
                                        onSelect={() => {
                                          if (isPathMode) {
                                            openChatDockThread(String(thread.id));
                                            return;
                                          }
                                          navigate(`/chat/threads/${thread.id}`);
                                        }}
                                        className="gap-2"
                                      >
                                        <MessageSquare className="h-4 w-4" />
                                        {t("sidebar.openChat")}
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </div>
                              </SidebarMenuSubItem>
                            );
                          })
                        )}
                      </SidebarMenuSub>
                    </m.div>
                  ) : null}
                </AnimatePresence>
              </SidebarGroup>
            </>
          )
		        ) : (
		          <>
		            <SidebarGroup className={cn(
                "sticky top-0 z-20 backdrop-blur-sm pt-4",
                !isCollapsed && "bg-sidebar/95 -mx-3 px-3"
              )}>
			              <SidebarGroupLabel>{t("sidebar.navigation")}</SidebarGroupLabel>
			              <SidebarMenu className={cn(isCollapsed ? "items-center gap-2.5" : "gap-2.5")}>
		                <SidebarMenuItem>
		                  <SidebarMenuButton
	                    asChild
	                    isActive={activeTab === "home"}
	                    tooltip={t("nav.home")}
	                    tooltipShortcut={homeShortcut}
	                  >
	                    <Link to="/" aria-label={t("nav.home")}>
	                      <Home />
	                      <span>{t("nav.home")}</span>
	                    </Link>
	                  </SidebarMenuButton>
	                </SidebarMenuItem>

                <SidebarMenuItem>
	                  <SidebarMenuButton
	                    asChild
	                    isActive={activeTab === "paths"}
	                    tooltip={t("nav.paths")}
	                    tooltipShortcut={pathsShortcut}
	                  >
	                    <Link to="/paths" aria-label={t("nav.paths")}>
	                      <Library />
	                      <span>{t("nav.paths")}</span>
	                    </Link>
	                  </SidebarMenuButton>
	                </SidebarMenuItem>

                <SidebarMenuItem>
	                  <SidebarMenuButton
	                    asChild
	                    isActive={activeTab === "files"}
	                    tooltip={t("nav.files")}
	                    tooltipShortcut={filesShortcut}
	                  >
	                    <Link to="/files" aria-label={t("nav.files")}>
	                      <Files />
	                      <span>{t("nav.files")}</span>
	                    </Link>
	                  </SidebarMenuButton>
	                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroup>

	            {!isCollapsed && (
	              <>
		                <SidebarGroup className="px-0">
		                  <SidebarGroupLabel asChild>
	                    <button
	                      type="button"
	                      aria-expanded={yourPathsOpen}
	                      aria-controls="sidebar-your-paths"
	                      onClick={() => setYourPathsOpen((v) => !v)}
	                      className="w-full gap-1.5 hover:bg-sidebar-accent/50 active:bg-sidebar-accent/60"
	                    >
	                      <span>{t("sidebar.yourPaths")}</span>
	                      <ChevronDown
	                        aria-hidden="true"
	                        className={cn(
	                          "transition-transform nb-duration-micro nb-ease-out motion-reduce:transition-none",
	                          yourPathsOpen ? "rotate-0" : "-rotate-90"
	                        )}
	                      />
	                    </button>
	                  </SidebarGroupLabel>

	                  <AnimatePresence initial={false}>
	                    {yourPathsOpen ? (
	                      <m.div
	                        key="sidebar-your-paths"
	                        initial={{ height: 0, opacity: 0 }}
	                        animate={{
	                          height: "auto",
	                          opacity: 1,
	                          transition: nbTransitions.default,
	                        }}
	                        exit={{ height: 0, opacity: 0, transition: nbTransitions.micro }}
	                        style={{ overflow: "hidden" }}
	                      >
	                        <SidebarMenuSub
	                          id="sidebar-your-paths"
	                          className="gap-2.5 mx-0 border-l-0 px-0 py-0"
	                        >
	                    {pathsLoading && !hasAnySidebarPaths ? (
	                      Array.from({ length: 6 }).map((_, i) => (
	                        <SidebarMenuSubItem key={`path-skel:${i}`}>
	                          <SidebarMenuSkeleton showIcon />
                        </SidebarMenuSubItem>
                      ))
	                    ) : !hasAnySidebarPaths ? (
	                      <SidebarMenuSubItem>
	                        <div className="px-3 py-2 text-xs text-sidebar-foreground/50">
	                          {t("sidebar.emptyPaths")}
	                        </div>
	                      </SidebarMenuSubItem>
	                    ) : (
	                      <>
	                        {generatingPaths.length > 0 && (
	                          <>
                            <SidebarMenuSubItem className="ps-2 -mb-1">
	                              <div className="flex h-7 items-center gap-2 px-3 text-[11px] font-medium uppercase tracking-wider text-sidebar-foreground/60">
	                                <CornerDownRight className="h-4 w-4 text-sidebar-foreground/50" aria-hidden="true" />
	                                <span>{t("home.sections.generating")}</span>
	                              </div>
	                            </SidebarMenuSubItem>

                            {generatingPaths.map((p) => {
                              const coverUrl = getPathAvatarUrl(p);
                              const fallbackColor = pickPathColor(String(p?.id || p?.title || ""));
                              const build = buildProgressState(p);
                              const isPlaceholder = String(p?.id || "").startsWith("job:");
                              const href = p?.jobId
                                ? `/paths/build/${p.jobId}`
                                : isPlaceholder
                                  ? null
                                  : `/paths/${p.id}`;

                              return (
                                <SidebarMenuSubItem
                                  key={p.id}
                                  className="ps-2"
                                  style={{ contentVisibility: "auto", containIntrinsicSize: "44px" }}
                                >
                                  <div className="flex w-full items-center gap-1 rounded-xl nb-motion-fast motion-reduce:transition-none hover:bg-sidebar-accent/70">
                                    <SidebarMenuSubButton
                                      asChild
                                      size="sm"
                                      isActive={currentPathId === p.id}
                                      aria-disabled={!href}
                                      className={cn(
                                        "flex-1 ps-9 pe-2 hover:bg-transparent hover:text-sidebar-foreground",
                                        "group-hover/menu-sub-item:text-sidebar-accent-foreground",
                                        !href && "cursor-default opacity-80"
                                      )}
                                    >
                                      {href ? (
                                        <Link to={href} aria-label={`Open ${pathLabel(p)}`}>
                                          <span
                                            className={cn(
                                              "flex h-4 w-4 shrink-0 items-center justify-center overflow-hidden rounded-full",
                                              build.showProgress ? "" : "border border-border/60 bg-muted/40"
                                            )}
                                            style={
                                              build.showProgress || coverUrl
                                                ? undefined
                                                : { backgroundColor: fallbackColor }
                                            }
                                            aria-hidden="true"
                                          >
                                            {build.showProgress ? (
                                              <ProgressRing size={16} progress={build.progressPct} strokeWidth={2.5} />
                                            ) : coverUrl ? (
                                              <img
                                                src={coverUrl}
                                                alt=""
                                                loading="lazy"
                                                decoding="async"
                                                className="h-full w-full object-cover"
                                              />
                                            ) : null}
                                          </span>
                                          <span className="truncate">{pathLabel(p)}</span>
                                        </Link>
                                      ) : (
                                        <div className="flex min-w-0 flex-1 items-center gap-2.5">
                                          <span
                                            className={cn(
                                              "flex h-4 w-4 shrink-0 items-center justify-center overflow-hidden rounded-full",
                                              build.showProgress ? "" : "border border-border/60 bg-muted/40"
                                            )}
                                            style={
                                              build.showProgress || coverUrl
                                                ? undefined
                                                : { backgroundColor: fallbackColor }
                                            }
                                            aria-hidden="true"
                                          >
                                            {build.showProgress ? (
                                              <ProgressRing size={16} progress={build.progressPct} strokeWidth={2.5} />
                                            ) : coverUrl ? (
                                              <img
                                                src={coverUrl}
                                                alt=""
                                                loading="lazy"
                                                decoding="async"
                                                className="h-full w-full object-cover"
                                              />
                                            ) : null}
                                          </span>
                                          <span className="truncate">{pathLabel(p)}</span>
                                        </div>
                                      )}
                                    </SidebarMenuSubButton>
                                    {/* Reserve space to match the action-button gutter in non-generating rows. */}
                                    <div className="h-8 w-8 shrink-0 pointer-events-none" aria-hidden="true" />
                                  </div>
                                </SidebarMenuSubItem>
                              );
                            })}
                          </>
                        )}

                        {nonGeneratingRealPaths.map((p) => {
                          const coverUrl = getPathAvatarUrl(p);
                          const fallbackColor = pickPathColor(String(p?.id || p?.title || ""));
                          const build = buildProgressState(p);
                          const isGenerating = coverLoadingId === p.id;
                          const actionKey = `path:${p.id}`;
                          const isActionHover = actionHoverId === actionKey;
                          const actionLabel = coverUrl ? "Regenerate avatar" : "Generate avatar";

                          return (
                            <SidebarMenuSubItem
                              key={p.id}
                              style={{ contentVisibility: "auto", containIntrinsicSize: "44px" }}
                            >
                              <div
                                className={cn(
                                  "flex w-full items-center gap-1 rounded-xl nb-motion-fast motion-reduce:transition-none",
                                  isActionHover ? "hover:bg-transparent" : "hover:bg-sidebar-accent/70"
                                )}
                              >
                                <SidebarMenuSubButton
                                  asChild
                                  isActive={currentPathId === p.id}
                                  className={cn(
                                    "flex-1 pe-2 hover:bg-transparent hover:text-sidebar-foreground",
                                    !isActionHover && "group-hover/menu-sub-item:text-sidebar-accent-foreground",
                                    isActionHover && "data-[active=true]:bg-transparent data-[active=true]:text-sidebar-foreground"
                                  )}
                                >
                                  <Link to={`/paths/${p.id}`} aria-label={`Open ${pathLabel(p)}`}>
                                    <span
                                      className={cn(
                                        "flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full",
                                        build.showProgress ? "" : "border border-border/60 bg-muted/40"
                                      )}
                                      style={
                                        build.showProgress || coverUrl
                                          ? undefined
                                          : { backgroundColor: fallbackColor }
                                      }
                                      aria-hidden="true"
                                    >
                                      {build.showProgress ? (
                                        <ProgressRing size={20} progress={build.progressPct} strokeWidth={3} />
                                      ) : coverUrl ? (
                                        <img
                                          src={coverUrl}
                                          alt=""
                                          loading="lazy"
                                          decoding="async"
                                          className="h-full w-full object-cover"
                                        />
                                      ) : null}
                                    </span>
                                    <span className="truncate">{pathLabel(p)}</span>
                                  </Link>
                                </SidebarMenuSubButton>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className={cn(
                                        "h-8 w-8 rounded-lg text-sidebar-foreground/70",
                                        "pointer-events-none opacity-0",
                                        "group-hover/menu-sub-item:pointer-events-auto group-hover/menu-sub-item:opacity-100",
                                        "group-focus-within/menu-sub-item:pointer-events-auto group-focus-within/menu-sub-item:opacity-100",
                                        "hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground"
                                    )}
                                    aria-label={`Open path actions for ${pathLabel(p)}`}
                                    onMouseEnter={() => setActionHoverId(actionKey)}
                                    onMouseLeave={() => setActionHoverId(null)}
                                    onFocus={() => setActionHoverId(actionKey)}
                                    onBlur={() => setActionHoverId(null)}
                                  >
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" side="right" className="w-56">
                                    <DropdownMenuItem
                                      onSelect={() => navigate(`/paths/${p.id}`)}
                                      className="gap-2"
                                    >
                                      <FolderOpen className="h-4 w-4" />
                                      Open path
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      disabled={isGenerating}
                                      onSelect={() => handleGenerateCover(p, Boolean(coverUrl))}
                                      className="gap-2"
                                    >
                                      <Sparkles className={cn("h-4 w-4", isGenerating && "animate-pulse")} />
                                      {isGenerating ? "Generating avatar…" : actionLabel}
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </SidebarMenuSubItem>
                          );
                        })}
                      </>
                    )}
	                        </SidebarMenuSub>
	                      </m.div>
	                    ) : null}
	                  </AnimatePresence>
	                </SidebarGroup>
	
	                <SidebarGroup className="px-0">
	                  <SidebarGroupLabel asChild>
	                    <button
	                      type="button"
	                      aria-expanded={yourFilesOpen}
	                      aria-controls="sidebar-your-files"
	                      onClick={() => setYourFilesOpen((v) => !v)}
	                      className="w-full gap-1.5 hover:bg-sidebar-accent/50 active:bg-sidebar-accent/60"
	                    >
	                      <span>{t("sidebar.yourFiles")}</span>
	                      <ChevronDown
	                        aria-hidden="true"
	                        className={cn(
	                          "transition-transform nb-duration-micro nb-ease-out motion-reduce:transition-none",
	                          yourFilesOpen ? "rotate-0" : "-rotate-90"
	                        )}
	                      />
	                    </button>
	                  </SidebarGroupLabel>

	                  <AnimatePresence initial={false}>
	                    {yourFilesOpen ? (
	                      <m.div
	                        key="sidebar-your-files"
	                        initial={{ height: 0, opacity: 0 }}
	                        animate={{
	                          height: "auto",
	                          opacity: 1,
	                          transition: nbTransitions.default,
	                        }}
	                        exit={{ height: 0, opacity: 0, transition: nbTransitions.micro }}
	                        style={{ overflow: "hidden" }}
	                      >
	                        <SidebarMenuSub
	                          id="sidebar-your-files"
	                          className="gap-2.5 mx-0 border-l-0 px-0 py-0"
	                        >
	                    {materialFilesLoading && visibleFiles.length === 0 ? (
	                      Array.from({ length: 6 }).map((_, i) => (
	                        <SidebarMenuSubItem key={`file-skel:${i}`}>
	                          <SidebarMenuSkeleton showIcon />
                        </SidebarMenuSubItem>
                      ))
                    ) : visibleFiles.length === 0 ? (
                      <SidebarMenuSubItem>
                        <div className="px-3 py-2 text-xs text-sidebar-foreground/50">
                          {t("sidebar.emptyFiles")}
                        </div>
                      </SidebarMenuSubItem>
                    ) : (
                      visibleFiles.map((file) => {
                        const Icon = fileIcon(file);
                        const label = fileLabel(file);
                        const thumbVersion = String(file?.updatedAt || file?.createdAt || "");
                        const thumbUrl = buildFileThumbnailUrl(file.id, thumbVersion);
                        const thumbKey = `${file.id}:${thumbVersion}`;
                        const showThumb = Boolean(thumbUrl) && !fileThumbErrors[thumbKey];
                        const actionKey = `file:${file.id}`;
                        const isActionHover = actionHoverId === actionKey;
                        return (
                          <SidebarMenuSubItem
                            key={file.id}
                            style={{ contentVisibility: "auto", containIntrinsicSize: "44px" }}
                          >
                            <div
                              className={cn(
                                "flex w-full items-center gap-1 rounded-xl nb-motion-fast motion-reduce:transition-none",
                                isActionHover ? "hover:bg-transparent" : "hover:bg-sidebar-accent/70"
                              )}
                            >
                              <SidebarMenuSubButton
                                asChild
                                className={cn(
                                  "flex-1 pe-2 hover:bg-transparent hover:text-sidebar-foreground",
                                  !isActionHover && "group-hover/menu-sub-item:text-sidebar-accent-foreground"
                                )}
                              >
                                <a
                                  href={buildFileViewUrl(file.id)}
                                  target="_blank"
                                  rel="noreferrer"
                                  aria-label={`Open ${label}`}
                                >
                                  <span className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border/60 bg-muted/40 text-muted-foreground">
                                    {showThumb ? (
                                      <img
                                        src={thumbUrl}
                                        alt=""
                                        loading="lazy"
                                        decoding="async"
                                        className="h-full w-full object-cover"
                                        onError={() => {
                                          setFileThumbErrors((prev) => ({ ...prev, [thumbKey]: true }));
                                        }}
                                      />
                                    ) : (
                                      <Icon className="h-4 w-4" />
                                    )}
                                  </span>
                                  <span className="truncate">{label}</span>
                                </a>
                              </SidebarMenuSubButton>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className={cn(
                                      "h-8 w-8 rounded-lg text-sidebar-foreground/70",
                                      "pointer-events-none opacity-0",
                                      "group-hover/menu-sub-item:pointer-events-auto group-hover/menu-sub-item:opacity-100",
                                      "group-focus-within/menu-sub-item:pointer-events-auto group-focus-within/menu-sub-item:opacity-100",
                                      "hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground"
                                    )}
                                    aria-label={`Open file actions for ${label}`}
                                    onMouseEnter={() => setActionHoverId(actionKey)}
                                    onMouseLeave={() => setActionHoverId(null)}
                                    onFocus={() => setActionHoverId(actionKey)}
                                    onBlur={() => setActionHoverId(null)}
                                  >
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" side="right" className="w-56">
                                  <DropdownMenuItem
                                    onSelect={() => {
                                      const url = buildFileViewUrl(file.id);
                                      window.open(url, "_blank", "noopener,noreferrer");
                                    }}
                                    className="gap-2"
                                  >
                                    <FileIcon className="h-4 w-4" />
                                    Open file
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </SidebarMenuSubItem>
	                        );
	                      })
	                    )}
	                        </SidebarMenuSub>
	                      </m.div>
	                    ) : null}
		                  </AnimatePresence>
		                </SidebarGroup>

		                <SidebarGroup className="px-0">
		                  <SidebarGroupLabel asChild>
		                    <button
		                      type="button"
		                      aria-expanded={yourChatsOpen}
		                      aria-controls="sidebar-your-chats"
		                      onClick={() => setYourChatsOpen((v) => !v)}
		                      className="w-full gap-1.5 hover:bg-sidebar-accent/50 active:bg-sidebar-accent/60"
		                    >
		                      <span>{t("sidebar.yourChats")}</span>
		                      <ChevronDown
		                        aria-hidden="true"
		                        className={cn(
		                          "transition-transform nb-duration-micro nb-ease-out motion-reduce:transition-none",
		                          yourChatsOpen ? "rotate-0" : "-rotate-90"
		                        )}
		                      />
		                    </button>
		                  </SidebarGroupLabel>

		                  <AnimatePresence initial={false}>
		                    {yourChatsOpen ? (
		                      <m.div
		                        key="sidebar-your-chats"
		                        initial={{ height: 0, opacity: 0 }}
		                        animate={{
		                          height: "auto",
		                          opacity: 1,
		                          transition: nbTransitions.default,
		                        }}
		                        exit={{ height: 0, opacity: 0, transition: nbTransitions.micro }}
		                        style={{ overflow: "hidden" }}
		                      >
		                        <SidebarMenuSub
		                          id="sidebar-your-chats"
		                          className="gap-2.5 mx-0 border-l-0 px-0 py-0"
		                        >
		                          {chatThreadsLoading && chatThreads.length === 0 ? (
		                            Array.from({ length: 6 }).map((_, i) => (
		                              <SidebarMenuSubItem key={`chat-skel:${i}`}>
		                                <SidebarMenuSkeleton showIcon />
		                              </SidebarMenuSubItem>
		                            ))
		                          ) : chatThreads.length === 0 ? (
		                            <SidebarMenuSubItem>
		                              <div className="px-3 py-2 text-xs text-sidebar-foreground/50">
		                                {t("sidebar.emptyChats")}
		                              </div>
		                            </SidebarMenuSubItem>
		                          ) : (
		                            chatThreads.map((thread) => {
		                              const isActive = currentThreadId != null && String(currentThreadId) === String(thread.id);
		                              const actionKey = `chat:${thread.id}`;
		                              const isActionHover = actionHoverId === actionKey;
		                              return (
		                                <SidebarMenuSubItem
		                                  key={thread.id}
		                                  style={{ contentVisibility: "auto", containIntrinsicSize: "44px" }}
		                                >
		                                  <div
		                                    className={cn(
		                                      "flex w-full items-center gap-1 rounded-xl nb-motion-fast motion-reduce:transition-none",
		                                      isActionHover ? "hover:bg-transparent" : "hover:bg-sidebar-accent/70"
		                                    )}
		                                  >
		                                    <SidebarMenuSubButton
		                                      asChild
		                                      isActive={isActive}
		                                      className={cn(
		                                        "flex-1 pe-2 hover:bg-transparent hover:text-sidebar-foreground",
		                                        !isActionHover && "group-hover/menu-sub-item:text-sidebar-accent-foreground",
		                                        isActionHover && "data-[active=true]:bg-transparent data-[active=true]:text-sidebar-foreground"
		                                      )}
		                                    >
		                                      <Link
		                                        to={`/chat/threads/${thread.id}`}
		                                        aria-label={t("sidebar.chats.open", { title: thread.title })}
		                                        onClick={(event) => {
		                                          if (!isPathMode) return;
		                                          event.preventDefault();
		                                          openChatDockThread(String(thread.id));
		                                        }}
		                                      >
		                                        <span className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border/60 bg-muted/40 text-muted-foreground">
		                                          <MessageSquare className="h-4 w-4" />
		                                        </span>
		                                        <span className="truncate">{thread.title}</span>
		                                      </Link>
		                                    </SidebarMenuSubButton>
		                                    <DropdownMenu>
		                                      <DropdownMenuTrigger asChild>
		                                        <Button
		                                          type="button"
		                                          variant="ghost"
		                                          size="icon"
		                                          className={cn(
		                                            "h-8 w-8 rounded-lg text-sidebar-foreground/70",
		                                            "pointer-events-none opacity-0",
		                                            "group-hover/menu-sub-item:pointer-events-auto group-hover/menu-sub-item:opacity-100",
		                                            "group-focus-within/menu-sub-item:pointer-events-auto group-focus-within/menu-sub-item:opacity-100",
		                                            "hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground"
		                                          )}
		                                          aria-label={t("sidebar.chats.actions", { title: thread.title })}
		                                          onMouseEnter={() => setActionHoverId(actionKey)}
		                                          onMouseLeave={() => setActionHoverId(null)}
		                                          onFocus={() => setActionHoverId(actionKey)}
		                                          onBlur={() => setActionHoverId(null)}
		                                        >
		                                          <MoreHorizontal className="h-4 w-4" />
		                                        </Button>
		                                      </DropdownMenuTrigger>
		                                      <DropdownMenuContent align="end" side="right" className="w-56">
		                                        <DropdownMenuItem
		                                          onSelect={() => {
		                                            if (isPathMode) {
		                                              openChatDockThread(String(thread.id));
		                                              return;
		                                            }
		                                            navigate(`/chat/threads/${thread.id}`);
		                                          }}
		                                          className="gap-2"
		                                        >
		                                          <MessageSquare className="h-4 w-4" />
		                                          {t("sidebar.openChat")}
		                                        </DropdownMenuItem>
		                                      </DropdownMenuContent>
		                                    </DropdownMenu>
		                                  </div>
		                                </SidebarMenuSubItem>
		                              );
		                            })
		                          )}
		                        </SidebarMenuSub>
		                      </m.div>
		                    ) : null}
		                  </AnimatePresence>
		                </SidebarGroup>
		              </>
		            )}
		          </>
		        )}
      </SidebarContent>

      {!isCollapsed && (
        <div className="px-3">
          <SidebarSeparator className="mx-0" />
        </div>
      )}

      <SidebarFooter className={cn("pb-3", isCollapsed ? "items-center" : "")}>
        <UserAvatar
          showMenu
          showColorPicker={false}
          showName={showFooterName}
          triggerClassName={cn(
            showFooterName
              ? "h-9 w-full justify-start rounded-2xl border border-transparent px-3 hover:border-sidebar-border/60 hover:bg-sidebar-accent/70"
              : "h-9 w-9 p-0 rounded-2xl border border-transparent hover:border-sidebar-border/60 hover:bg-sidebar-accent/70"
          )}
          menuSide="top"
          menuAlign={isCollapsed ? "center" : "start"}
          menuAlignOffset={0}
          menuSideOffset={8}
        />
      </SidebarFooter>
    </Sidebar>
  );
}
