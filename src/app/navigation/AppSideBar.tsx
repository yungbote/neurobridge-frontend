import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, matchPath, useNavigate } from "react-router-dom";
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
  SidebarGroup,
  SidebarGroupLabel,
  SidebarSeparator,
} from "@/shared/ui/sidebar";
import { AppLogo } from "@/shared/components/AppLogo";
import {
  File as FileIcon,
  FileText,
  Files,
  FolderOpen,
  Home,
  ImageIcon,
  Library,
  MoreHorizontal,
  Sparkles,
  Video,
} from "lucide-react";
import { useAuth } from "@/app/providers/AuthProvider";
import { usePaths } from "@/app/providers/PathProvider";
import { useLessons } from "@/app/providers/LessonProvider";
import type { MaterialFile, Path, PathNode } from "@/shared/types/models";
import { cn } from "@/shared/lib/utils";
import { UserAvatar } from "@/features/user/components/UserAvatar";
import { listUserMaterialFiles } from "@/shared/api/MaterialService";
import { generatePathCover, listNodesForPath } from "@/shared/api/PathService";
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

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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

export function AppSideBar() {
  const { state, isMobile, openMobile, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";

  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const {
    paths,
    reload,
    activePathId,
    activePath: activePathFromProvider,
    activatePath,
    clearActivePath,
  } = usePaths();
  const { activateLesson, clearActiveLesson } = useLessons();
  const [coverLoadingId, setCoverLoadingId] = useState<string | null>(null);
  const [actionHoverId, setActionHoverId] = useState<string | null>(null);
  const [files, setFiles] = useState<MaterialFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [lessons, setLessons] = useState<PathNode[]>([]);
  const [lessonsLoading, setLessonsLoading] = useState(false);
  const lastNormalRouteRef = useRef<string>("/");

  const showFooterName = isMobile ? openMobile : !isCollapsed;

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

  const activeTab = useMemo(() => {
    const path = location.pathname;
    if (matchPath({ path: "/paths", end: false }, path)) return "paths";
    if (matchPath({ path: "/paths/:id", end: false }, path)) return "paths";
    if (matchPath({ path: "/activities/:id", end: false }, path)) return "paths";
    if (matchPath({ path: "/files", end: false }, path)) return "files";
    if (path === "/") return "home";
    return "home";
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

  useEffect(() => {
    // Track last "normal" nav tab so the path switcher can return to it.
    if (isPathMode) return;
    const p = location.pathname;
    if (p === "/") lastNormalRouteRef.current = "/";
    else if (matchPath({ path: "/paths", end: true }, p)) lastNormalRouteRef.current = "/paths";
    else if (matchPath({ path: "/files", end: false }, p)) lastNormalRouteRef.current = "/files";
  }, [isPathMode, location.pathname]);

  useEffect(() => {
    if (!isAuthenticated) {
      setLessons([]);
      setLessonsLoading(false);
      return;
    }
    if (isCollapsed) {
      setLessonsLoading(false);
      return;
    }
    if (!pathContextPathId) {
      setLessons([]);
      setLessonsLoading(false);
      return;
    }

    let cancelled = false;
    const load = async () => {
      setLessonsLoading(true);
      setLessons([]);
      try {
        const nodes = await listNodesForPath(String(pathContextPathId));
        if (cancelled) return;
        const sorted = (nodes || []).slice().sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
        setLessons(sorted);
      } catch (err) {
        if (!cancelled) setLessons([]);
      } finally {
        if (!cancelled) setLessonsLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isCollapsed, pathContextPathId]);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (!pathIdFromRoute) return;
    if (String(activePathId || "") === String(pathIdFromRoute)) return;
    void activatePath(String(pathIdFromRoute)).catch((err) => {
      console.warn("[AppSideBar] Failed to activate path from route:", err);
    });
  }, [activePathId, activatePath, isAuthenticated, pathIdFromRoute]);

  useEffect(() => {
    if (!isAuthenticated) {
      setFiles([]);
      setFilesLoading(false);
      return;
    }
    let cancelled = false;
    const loadFiles = async () => {
      setFilesLoading(true);
      try {
        const loaded = await listUserMaterialFiles();
        if (cancelled) return;
        const sorted = (loaded || []).slice().sort((a, b) => {
          const ad = new Date(a?.updatedAt || a?.createdAt || 0).getTime();
          const bd = new Date(b?.updatedAt || b?.createdAt || 0).getTime();
          return bd - ad;
        });
        setFiles(sorted);
      } catch (err) {
        if (!cancelled) {
          console.error("[AppSideBar] Failed to load material files:", err);
          setFiles([]);
        }
      } finally {
        if (!cancelled) setFilesLoading(false);
      }
    };
    loadFiles();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  const visibleFiles = useMemo(() => files.slice(0, 12), [files]);

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
                          className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border/60 bg-muted/40"
                          style={
                            getPathAvatarUrl(activePath)
                              ? undefined
                              : { backgroundColor: pickPathColor(String(activePath?.id || pathContextPathId || "")) }
                          }
                          aria-hidden="true"
                        >
                          {getPathAvatarUrl(activePath) ? (
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
                        <SidebarTrigger aria-label="Expand sidebar" style={{ cursor: "e-resize" }} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="right" shortcut={sidebarShortcut}>
                      Expand sidebar
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>
            ) : (
              <div className="group relative shrink-0 min-w-max">
                <div className="transition-opacity duration-150 opacity-100 group-hover:opacity-0">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" className={sidebarGhost} asChild aria-label="Neurobridge">
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
                        <SidebarTrigger aria-label="Expand sidebar" style={{ cursor: "e-resize" }} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="right" shortcut={sidebarShortcut}>
                      Expand sidebar
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
                    aria-label={`Switch path (${pathLabel(activePath)})`}
                  >
                    <div className="flex items-center justify-center" style={{ cursor: "pointer" }}>
                      <span
                        className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border/60 bg-muted/40"
                        style={
                          getPathAvatarUrl(activePath)
                            ? undefined
                            : { backgroundColor: pickPathColor(String(activePath?.id || pathContextPathId || "")) }
                        }
                        aria-hidden="true"
                      >
                        {getPathAvatarUrl(activePath) ? (
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
                    Switch path
                  </div>
                  <div className="scrollbar-none grid max-h-[240px] grid-cols-5 justify-items-center gap-2 overflow-y-auto px-1 pb-1">
                    <DropdownMenuItem
                      className="h-12 w-12 justify-center rounded-2xl p-0"
                      onSelect={() => {
                        clearActiveLesson();
                        clearActivePath();
                        navigate(lastNormalRouteRef.current || "/");
                      }}
                      aria-label="Return to Neurobridge"
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
                            aria-label={`Switch to ${name}`}
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
                  <Button variant="ghost" size="icon" className={sidebarGhost} asChild aria-label="Neurobridge">
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
                  <SidebarTrigger aria-label="Collapse sidebar" style={{ cursor: "w-resize" }} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" shortcut={sidebarShortcut}>
                Collapse sidebar
              </TooltipContent>
            </Tooltip>
          </div>
        )}
      </SidebarHeader>

      <SidebarContent className={cn("py-4", isCollapsed ? "px-0" : "px-3")}>
        {isPathMode ? (
          isCollapsed ? null : (
            <SidebarGroup className="px-0">
              <SidebarGroupLabel>Your lessons</SidebarGroupLabel>
              <SidebarMenuSub className="gap-2.5 mx-0 border-l-0 px-0 py-0">
                {lessonsLoading && lessons.length === 0 ? (
                  <SidebarMenuSubItem>
                    <div className="px-3 py-2 text-xs text-sidebar-foreground/50">
                      Loading lessons...
                    </div>
                  </SidebarMenuSubItem>
                ) : lessons.length === 0 ? (
                  <SidebarMenuSubItem>
                    <div className="px-3 py-2 text-xs text-sidebar-foreground/50">
                      No lessons yet
                    </div>
                  </SidebarMenuSubItem>
                ) : (
                  lessons.map((n) => {
                    const avatarUrl = getLessonAvatarUrl(n);
                    const fallbackColor = pickPathColor(String(n?.id || n?.title || ""));
                    const isActive =
                      matchPath({ path: `/path-nodes/${n.id}`, end: false }, location.pathname) != null;
                    return (
                      <SidebarMenuSubItem key={n.id}>
                        <div className="flex w-full items-center gap-1 rounded-xl transition-colors hover:bg-sidebar-accent/70">
                          <SidebarMenuSubButton
                            asChild
                            isActive={isActive}
                            className="flex-1 pr-2 hover:bg-transparent hover:text-sidebar-foreground group-hover/menu-sub-item:text-sidebar-accent-foreground"
                          >
                            <Link
                              to={`/path-nodes/${n.id}`}
                              aria-label={`Open ${n.title || "lesson"}`}
                              onClick={() => {
                                void activateLesson(String(n.id)).catch((err) => {
                                  console.warn("[AppSideBar] Failed to activate lesson:", err);
                                });
                              }}
                            >
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
                                ) : null}
                              </span>
                              <span className="truncate">{n.title || "Lesson"}</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </div>
                      </SidebarMenuSubItem>
                    );
                  })
                )}
              </SidebarMenuSub>
            </SidebarGroup>
          )
        ) : (
          <>
            <SidebarGroup className="px-0">
              <SidebarGroupLabel>Navigation</SidebarGroupLabel>
              <SidebarMenu className={cn(isCollapsed ? "items-center gap-2.5" : "gap-2.5")}>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={activeTab === "home"}
                    tooltip="Home"
                    tooltipShortcut={homeShortcut}
                  >
                    <Link to="/" aria-label="Home">
                      <Home />
                      <span>Home</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={activeTab === "paths"}
                    tooltip="Paths"
                    tooltipShortcut={pathsShortcut}
                  >
                    <Link to="/paths" aria-label="Paths">
                      <Library />
                      <span>Paths</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={activeTab === "files"}
                    tooltip="Files"
                    tooltipShortcut={filesShortcut}
                  >
                    <Link to="/files" aria-label="Files">
                      <Files />
                      <span>Files</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroup>

            {!isCollapsed && (
              <>
                <SidebarGroup className="px-0">
                  <SidebarGroupLabel>Your paths</SidebarGroupLabel>
                  <SidebarMenuSub className="gap-2.5 mx-0 border-l-0 px-0 py-0">
                    {realPaths.length === 0 ? (
                      <SidebarMenuSubItem>
                        <div className="px-3 py-2 text-xs text-sidebar-foreground/50">
                          No paths yet
                        </div>
                      </SidebarMenuSubItem>
                    ) : (
                      realPaths.slice(0, 12).map((p) => {
                        const coverUrl = getPathAvatarUrl(p);
                        const fallbackColor = pickPathColor(String(p?.id || p?.title || ""));
                        const isGenerating = coverLoadingId === p.id;
                        const isActionHover = actionHoverId === p.id;
                        const actionLabel = coverUrl ? "Regenerate avatar" : "Generate avatar";

                        return (
                          <SidebarMenuSubItem key={p.id}>
                            <div
                              className={cn(
                                "flex w-full items-center gap-1 rounded-xl transition-colors",
                                isActionHover ? "hover:bg-transparent" : "hover:bg-sidebar-accent/70"
                              )}
                            >
                              <SidebarMenuSubButton
                                asChild
                                isActive={currentPathId === p.id}
                                className={cn(
                                  "flex-1 pr-2 hover:bg-transparent hover:text-sidebar-foreground",
                                  !isActionHover && "group-hover/menu-sub-item:text-sidebar-accent-foreground",
                                  isActionHover && "data-[active=true]:bg-transparent data-[active=true]:text-sidebar-foreground"
                                )}
                              >
                                <Link to={`/paths/${p.id}`} aria-label={`Open ${pathLabel(p)}`}>
                                  <span
                                    className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border/60 bg-muted/40"
                                    style={coverUrl ? undefined : { backgroundColor: fallbackColor }}
                                    aria-hidden="true"
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
                                      "h-8 w-8 rounded-lg text-sidebar-foreground/70 transition-opacity",
                                      "pointer-events-none opacity-0",
                                      "group-hover/menu-sub-item:pointer-events-auto group-hover/menu-sub-item:opacity-100",
                                      "group-focus-within/menu-sub-item:pointer-events-auto group-focus-within/menu-sub-item:opacity-100",
                                      "hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground"
                                    )}
                                    aria-label={`Open path actions for ${pathLabel(p)}`}
                                    onMouseEnter={() => setActionHoverId(p.id)}
                                    onMouseLeave={() => setActionHoverId(null)}
                                    onFocus={() => setActionHoverId(p.id)}
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
                      })
                    )}
                  </SidebarMenuSub>
                </SidebarGroup>

                <SidebarGroup className="px-0">
                  <SidebarGroupLabel>Your files</SidebarGroupLabel>
                  <SidebarMenuSub className="gap-2.5 mx-0 border-l-0 px-0 py-0">
                    {filesLoading && visibleFiles.length === 0 ? (
                      <SidebarMenuSubItem>
                        <div className="px-3 py-2 text-xs text-sidebar-foreground/50">
                          Loading files...
                        </div>
                      </SidebarMenuSubItem>
                    ) : visibleFiles.length === 0 ? (
                      <SidebarMenuSubItem>
                        <div className="px-3 py-2 text-xs text-sidebar-foreground/50">
                          No files yet
                        </div>
                      </SidebarMenuSubItem>
                    ) : (
                      visibleFiles.map((file) => {
                        const Icon = fileIcon(file);
                        const label = fileLabel(file);
                        return (
                          <SidebarMenuSubItem key={file.id}>
                            <div className="flex w-full items-center gap-1 rounded-xl transition-colors hover:bg-sidebar-accent/70">
                              <SidebarMenuSubButton
                                asChild
                                className="flex-1 pr-2 hover:bg-transparent hover:text-sidebar-foreground group-hover/menu-sub-item:text-sidebar-accent-foreground"
                              >
                                <a
                                  href={buildFileViewUrl(file.id)}
                                  target="_blank"
                                  rel="noreferrer"
                                  aria-label={`Open ${label}`}
                                >
                                  <span className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border/60 bg-muted/40 text-muted-foreground">
                                    <Icon className="h-4 w-4" />
                                  </span>
                                  <span className="truncate">{label}</span>
                                </a>
                              </SidebarMenuSubButton>
                            </div>
                          </SidebarMenuSubItem>
                        );
                      })
                    )}
                  </SidebarMenuSub>
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
