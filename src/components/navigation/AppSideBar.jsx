import { useMemo } from "react";
import { Link, useLocation, matchPath } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarTrigger,
  useSidebar,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarGroup,
  SidebarGroupLabel,
} from "@/components/ui/sidebar";
import { AppLogo } from "@/components/app/AppLogo";
import { Home, Library, Files } from "lucide-react";
import { usePaths } from "@/providers/PathProvider";
import { cn } from "@/lib/utils";

function getMeta(path) {
  const m = path?.metadata;
  if (!m) return {};
  if (typeof m === "object") return m;
  if (typeof m === "string") {
    try {
      return JSON.parse(m);
    } catch {
      return {};
    }
  }
  return {};
}

function pathLabel(path) {
  const meta = getMeta(path);
  return meta.short_title || meta.shortTitle || path?.title || "Path";
}

export function AppSideBar() {
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";
  const location = useLocation();
  const { paths } = usePaths();

  // header buttons only
  const sidebarGhost =
    "h-10 w-10 rounded-md hover:bg-sidebar-accent/80 hover:text-sidebar-accent-foreground";

  const activeTab = useMemo(() => {
    const path = location.pathname;
    if (matchPath({ path: "/paths/:id", end: false }, path)) return "paths";
    if (matchPath({ path: "/activities/:id", end: false }, path)) return "paths";
    if (matchPath({ path: "/files", end: false }, path)) return "files";
    if (path === "/") return "home";
    return "home";
  }, [location.pathname]);

  const currentPathId = useMemo(() => {
    const m = matchPath({ path: "/paths/:id", end: true }, location.pathname);
    return m?.params?.id || null;
  }, [location.pathname]);

  const sortedPaths = useMemo(() => {
    const list = Array.isArray(paths) ? paths.slice() : [];
    list.sort((a, b) => {
      const ad = new Date(a?.updatedAt || a?.updated_at || a?.createdAt || a?.created_at || 0).getTime();
      const bd = new Date(b?.updatedAt || b?.updated_at || b?.createdAt || b?.created_at || 0).getTime();
      return bd - ad;
    });
    return list;
  }, [paths]);

  const realPaths = useMemo(() => {
    return (sortedPaths || []).filter((p) => !String(p?.id || "").startsWith("job:"));
  }, [sortedPaths]);

  return (
    <Sidebar collapsible="icon">
      {/* HEADER */}
      <SidebarHeader className="h-14 px-3 flex items-center">
        {isCollapsed ? (
          <div className="flex w-full items-center justify-center">
            <div className="group relative shrink-0 min-w-max">
              <div className="transition-opacity duration-150 opacity-100 group-hover:opacity-0">
                <Button variant="ghost" size="icon" className={sidebarGhost} asChild>
                  <div className="flex items-center justify-center">
                    <AppLogo className="shrink-0" />
                  </div>
                </Button>
              </div>
              <div className="absolute inset-0 flex items-center justify-center opacity-0 pointer-events-none transition-opacity duration-150 group-hover:opacity-100 group-hover:pointer-events-auto">
                <Button variant="ghost" size="icon" className={sidebarGhost} asChild>
                  <SidebarTrigger aria-label="Expand sidebar" style={{ cursor: "e-resize" }} />
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex w-full items-center justify-between">
            <Button variant="ghost" size="icon" className={sidebarGhost} asChild>
              <div className="flex items-center justify-center" style={{ cursor: "pointer" }}>
                <AppLogo className="shrink-0" />
              </div>
            </Button>
            <Button variant="ghost" size="icon" className={sidebarGhost} asChild>
              <SidebarTrigger aria-label="Collapse sidebar" style={{ cursor: "w-resize" }} />
            </Button>
          </div>
        )}
      </SidebarHeader>

      {/* CONTENT */}
      <SidebarContent className={cn("py-3", isCollapsed ? "px-0" : "px-2")}>
        {/* Navigation */}
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarMenu className={cn(isCollapsed ? "items-center gap-3" : "gap-3")}>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={activeTab === "home"} tooltip="Home">
                <Link to="/" aria-label="Home" className="flex items-center">
                  <Home />
                  <span className="ml-2">Home</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={activeTab === "paths"} tooltip="Paths">
                <Link to="/" aria-label="Paths" className="flex items-center">
                  <Library />
                  <span className="ml-2">Paths</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={activeTab === "files"} tooltip="Files">
                <Link to="/files" aria-label="Files" className="flex items-center">
                  <Files />
                  <span className="ml-2">Files</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        {/* Your paths (expanded only) */}
        {!isCollapsed && (
          <SidebarGroup>
            <SidebarGroupLabel>Your paths</SidebarGroupLabel>
            <SidebarMenuSub className="gap-3 mx-0 border-l-0 px-0 py-0">
              {realPaths.length === 0 ? (
                <SidebarMenuSubItem>
                  <div className="px-2 py-2 text-xs text-sidebar-foreground/50">
                    No paths yet
                  </div>
                </SidebarMenuSubItem>
              ) : (
                realPaths.slice(0, 12).map((p) => (
                  <SidebarMenuSubItem key={p.id}>
                    <SidebarMenuSubButton asChild isActive={currentPathId === p.id}>
                      <Link to={`/paths/${p.id}`} aria-label={`Open ${pathLabel(p)}`}>
                        <span className="truncate">{pathLabel(p)}</span>
                      </Link>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                ))
              )}
            </SidebarMenuSub>
          </SidebarGroup>
        )}
      </SidebarContent>
    </Sidebar>
  );
}







