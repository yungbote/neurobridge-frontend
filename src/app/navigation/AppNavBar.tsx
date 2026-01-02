import { useEffect, useMemo, useState } from "react";
import { Link, matchPath, useLocation, useNavigate } from "react-router-dom";
import {
  AlignJustify,
  BadgePlus,
  BookOpen,
  Brain,
  ChevronDownIcon,
  CircleDashed,
  Ellipsis,
  FolderOpen,
  Headphones,
} from "lucide-react";
import { Button } from "@/shared/ui/button";
import { IconButton } from "@/shared/ui/icon-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { SidebarTrigger } from "@/shared/ui/sidebar";
import { LoginDialog } from "@/features/auth/components/LoginDialog";
import { SignupDialog } from "@/features/auth/components/SignupDialog";
import { AppLogo } from "@/shared/components/AppLogo";
import { ThemeToggle } from "@/app/providers/ThemeProvider";
import { MarketingNav } from "@/features/marketing/components/MarketingNav";
import { UserAvatar } from "@/features/user/components/UserAvatar";
import { FileUploadDialog } from "@/features/paths/components/FileUploadDialog";
import { useAuth } from "@/app/providers/AuthProvider";
import { useUser } from "@/app/providers/UserProvider";
import { usePaths } from "@/app/providers/PathProvider";
import { Container } from "@/shared/layout/Container";
import { useSidebar } from "@/shared/ui/sidebar";
import { cn } from "@/shared/lib/utils";

const PATH_NAV_TABS = [
  { id: "materials", label: "Materials", icon: FolderOpen },
  { id: "unit", label: "Unit", icon: BookOpen },
  { id: "audio", label: "Audio", icon: Headphones },
  { id: "mindmap", label: "Mindmap", icon: Brain },
] as const;

type PathNavTabId = (typeof PATH_NAV_TABS)[number]["id"];

export function AppNavBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { user, loading: userLoading } = useUser();
  const { activePathId, clearActivePath } = usePaths();
  const [authDialog, setAuthDialog] = useState<"login" | "signup" | null>(null);
  const { state, isMobile } = useSidebar();
  const isCollapsed = state === "collapsed";

  const isPathContext = useMemo(() => {
    const path = location.pathname;
    if (matchPath({ path: "/paths/build/:jobId", end: false }, path)) {
      return false;
    }
    return Boolean(
      matchPath({ path: "/paths/:id", end: false }, path) ||
        matchPath({ path: "/path-nodes/:id", end: false }, path) ||
        matchPath({ path: "/activities/:id", end: false }, path)
    );
  }, [location.pathname]);

  const pathIdFromRoute = useMemo(() => {
    const match = matchPath({ path: "/paths/:id", end: false }, location.pathname);
    return match?.params?.id ? String(match.params.id) : null;
  }, [location.pathname]);

  const viewParam = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return String(params.get("view") || "").toLowerCase();
  }, [location.search]);

  const activePathTab = useMemo(() => {
    if (!isPathContext) return "unit";
    if (viewParam === "mindmap" || viewParam === "graph") return "mindmap";
    if (viewParam === "materials") return "materials";
    if (viewParam === "audio") return "audio";
    return "unit";
  }, [isPathContext, viewParam]);

  useEffect(() => {
    if (!activePathId) return;
    if (!isPathContext) clearActivePath();
  }, [activePathId, clearActivePath, isPathContext]);

  const showPathTabs = isAuthenticated && isPathContext && (activePathId || pathIdFromRoute);

  const handlePathTabClick = (tabId: PathNavTabId) => {
    const targetPathId = pathIdFromRoute || activePathId;
    if (!targetPathId) return;
    const base = `/paths/${targetPathId}`;
    if (tabId === "mindmap") {
      navigate(`${base}?view=mindmap`);
      return;
    }
    if (tabId === "materials") {
      navigate(`${base}?view=materials`);
      return;
    }
    if (tabId === "audio") {
      navigate(`${base}?view=audio`);
      return;
    }
    navigate(base);
  };

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <Container
        as="div"
        className="flex h-14 items-center gap-3"
      >
        {/* LEFT: Sidebar Trigger + Logo */}
        <div className="flex items-center gap-2">
          {isAuthenticated && isCollapsed && isMobile &&  (
            <SidebarTrigger aria-label="Expand sidebar" style={{ cursor: "e-resize" }} />
          )}
          {!isAuthenticated && (
          <Link to="/" aria-label="Go to home" className="flex items-center">
            <AppLogo className="cursor-pointer" />
          </Link>)}
        </div>

        {/* CENTER: Marketing Nav (desktop) */}
        {!isAuthenticated && (
          <div className="hidden md:flex flex-1 justify-center">
            <MarketingNav />
          </div>
        )}

        {showPathTabs && (
          <div className="flex flex-1 justify-center">
            <div
              role="tablist"
              aria-label="Path sections"
              className="flex max-w-full items-center gap-1 overflow-x-auto rounded-full border border-border/60 bg-muted/40 p-1 shadow-sm backdrop-blur scrollbar-none"
            >
              {PATH_NAV_TABS.map((tab) => {
                const Icon = tab.icon;
                const isActive = activePathTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => handlePathTabClick(tab.id)}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30 sm:text-sm",
                      isActive
                        ? "bg-foreground text-background shadow-sm"
                        : "text-muted-foreground hover:text-foreground hover:bg-background/70"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="whitespace-nowrap">{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* RIGHT: Auth / User Actions */}
        {!isAuthenticated && (
          <div className="ml-auto flex items-center gap-2">
            {/* Mobile marketing menu */}
            <div className="md:hidden">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Open menu"
                    title="Open menu"
                  >
                    <AlignJustify className="size-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem asChild>
                    <Link to="/about" className="w-full cursor-pointer">
                      About
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/features" className="w-full cursor-pointer">
                      Features
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/pricing" className="w-full cursor-pointer">
                      Pricing
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <LoginDialog
              triggerLabel="Login"
              open={authDialog === "login"}
              onOpenChange={(open: boolean) => {
                setAuthDialog(open ? "login" : null);
              }}
              onSwitchToSignup={() => setAuthDialog("signup")}
            />
            <SignupDialog
              triggerLabel="Sign up"
              open={authDialog === "signup"}
              onOpenChange={(open: boolean) => {
                setAuthDialog(open ? "signup" : null);
              }}
              onSwitchToLogin={() => setAuthDialog("login")}
            />
            <ThemeToggle />
          </div>
        )}

        {isAuthenticated && !userLoading && user && (
          <div className="ml-auto">
            <IconButton
              type="button"
              variant="ghost"
              size="icon"
              label="More options"
            >
              <Ellipsis className="size-5" />
            </IconButton>
          </div>
        )}

        {isAuthenticated && !userLoading && !user && (
          <div className="ml-auto flex items-center gap-1.5 sm:gap-3">
            {location.pathname === "/" && (
              <>
                <FileUploadDialog
                  trigger={
                    <Button variant="ghost" size="sm" className="gap-2">
                      <BadgePlus className="size-5" />
                      <span className="hidden sm:inline">New Path</span>
                    </Button>
                  }
                />

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="group flex items-center justify-between gap-2 data-[state=open]:bg-accent data-[state=open]:text-accent-foreground"
                    >
                      <div className="flex items-center gap-1.5">
                        <CircleDashed className="size-5" />
                        <span className="hidden sm:inline">In Progress</span>
                      </div>
                      <ChevronDownIcon className="size-5 transition-transform group-data-[state=open]:rotate-180" />
                    </Button>
                  </DropdownMenuTrigger>
                </DropdownMenu>
              </>
            )}
          </div>
        )}
      </Container>
    </nav>
  );
}
