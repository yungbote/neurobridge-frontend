import { useMemo } from "react";
import { Link, useLocation, matchPath } from "react-router-dom";
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
import { Home, Library, Files } from "lucide-react";
import { usePaths } from "@/app/providers/PathProvider";
import type { Path } from "@/shared/types/models";
import { cn } from "@/shared/lib/utils";
import { UserAvatar } from "@/features/user/components/UserAvatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";

function getMeta(path: Path | null | undefined): Record<string, unknown> {
  const m = path?.metadata;
  if (!m) return {};
  if (typeof m === "object" && !Array.isArray(m)) return m as Record<string, unknown>;
  if (typeof m === "string") {
    try {
      return JSON.parse(m);
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

export function AppSideBar() {
  const { state, isMobile, openMobile } = useSidebar();
  const isCollapsed = state === "collapsed";

  const location = useLocation();
  const { paths } = usePaths();

  const showFooterName = isMobile ? openMobile : !isCollapsed;

  const sidebarGhost =
    "rounded-xl text-sidebar-foreground/80 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground";

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
      const ad = new Date(a?.updatedAt || a?.createdAt || 0).getTime();
      const bd = new Date(b?.updatedAt || b?.createdAt || 0).getTime();
      return bd - ad;
    });
    return list;
  }, [paths]);

  const realPaths = useMemo(() => {
    return (sortedPaths || []).filter((p) => !String(p?.id || "").startsWith("job:"));
  }, [sortedPaths]);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="h-16 px-3 flex items-center">
        {isCollapsed ? (
          <div className="flex w-full items-center justify-center">
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
                  <TooltipContent side="right">Neurobridge</TooltipContent>
                </Tooltip>
              </div>
              <div className="absolute inset-0 flex items-center justify-center opacity-0 pointer-events-none transition-opacity duration-150 group-hover:opacity-100 group-hover:pointer-events-auto">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className={sidebarGhost} asChild>
                      <SidebarTrigger aria-label="Expand sidebar" style={{ cursor: "e-resize" }} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right">Expand sidebar</TooltipContent>
                </Tooltip>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex w-full items-center justify-between">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className={sidebarGhost} asChild aria-label="Neurobridge">
                  <div className="flex items-center justify-center" style={{ cursor: "pointer" }}>
                    <AppLogo className="shrink-0" />
                  </div>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Neurobridge</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className={sidebarGhost} asChild>
                  <SidebarTrigger aria-label="Collapse sidebar" style={{ cursor: "w-resize" }} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Collapse sidebar</TooltipContent>
            </Tooltip>
          </div>
        )}
      </SidebarHeader>

      <SidebarContent className={cn("py-4", isCollapsed ? "px-0" : "px-3")}>
        <SidebarGroup className="px-0">
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarMenu className={cn(isCollapsed ? "items-center gap-2.5" : "gap-2.5")}>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={activeTab === "home"} tooltip="Home">
                <Link to="/" aria-label="Home">
                  <Home />
                  <span>Home</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>

            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={activeTab === "paths"} tooltip="Paths">
                <Link to="/" aria-label="Paths">
                  <Library />
                  <span>Paths</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>

            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={activeTab === "files"} tooltip="Files">
                <Link to="/files" aria-label="Files">
                  <Files />
                  <span>Files</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        {!isCollapsed && (
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

