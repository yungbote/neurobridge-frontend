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
import { useHomeChatbarDock } from "@/app/providers/HomeChatbarDockProvider";
import { Container } from "@/shared/layout/Container";
import { useSidebar } from "@/shared/ui/sidebar";
import { cn } from "@/shared/lib/utils";
import { m } from "framer-motion";
import { nbTransitions } from "@/shared/motion/presets";
import { useI18n } from "@/app/providers/I18nProvider";

const PATH_NAV_TABS = [
  { id: "materials", labelKey: "paths.tabs.materials", icon: FolderOpen },
  { id: "unit", labelKey: "paths.tabs.unit", icon: BookOpen },
  { id: "audio", labelKey: "paths.tabs.audio", icon: Headphones },
  { id: "mindmap", labelKey: "paths.tabs.mindmap", icon: Brain },
] as const;

type PathNavTabId = (typeof PATH_NAV_TABS)[number]["id"];

export function AppNavBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { user, loading: userLoading } = useUser();
  const { activePathId, clearActivePath } = usePaths();
  const { docked: homeChatbarDocked } = useHomeChatbarDock();
  const { t } = useI18n();
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
  const isHome = location.pathname === "/";
  const showHomeChatbarDock = isAuthenticated && isHome && homeChatbarDocked && !showPathTabs;

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
    <nav
      id="app-navbar"
      className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
    >
      <Container
        as="div"
        size={isAuthenticated ? "app" : "lg"}
        className="relative flex h-14 items-center gap-3"
      >
        {/* LEFT: Sidebar Trigger + Logo */}
        <div className="flex items-center gap-2">
          {isAuthenticated && isCollapsed && isMobile &&  (
            <SidebarTrigger aria-label={t("sidebar.expand")} style={{ cursor: "e-resize" }} />
          )}
          {!isAuthenticated && (
          <Link to="/" aria-label={t("nav.goHome")} className="flex items-center">
            <AppLogo className="cursor-pointer" />
          </Link>)}
        </div>

        {/* CENTER: Marketing Nav (desktop) */}
        {!isAuthenticated && (
          <div className="hidden md:flex flex-1 justify-center">
            <MarketingNav />
          </div>
        )}

        {isAuthenticated && isHome && !showPathTabs && (
          <m.div
            initial={false}
            animate={showHomeChatbarDock ? "open" : "closed"}
            variants={{
              open: { opacity: 1, scale: 1 },
              closed: { opacity: 0, scale: 0.985 },
            }}
            transition={nbTransitions.default}
            className="pointer-events-none absolute inset-0 flex items-center justify-center transform-gpu"
            aria-hidden={!showHomeChatbarDock}
          >
            <div
              className={cn(
                "pointer-events-auto w-full max-w-2xl min-w-0",
                showHomeChatbarDock ? "pointer-events-auto" : "pointer-events-none"
              )}
            >
              <div id="home-chatbar-navbar-slot" />
            </div>
          </m.div>
        )}

        {showPathTabs && (
          <div className="flex flex-1 justify-center">
            <div
              role="tablist"
              aria-label={t("paths.sections")}
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
                      "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium nb-motion-fast motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30 sm:text-sm",
                      isActive
                        ? "bg-foreground text-background shadow-sm"
                        : "text-muted-foreground hover:text-foreground hover:bg-background/70"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="whitespace-nowrap">{t(tab.labelKey)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* RIGHT: Auth / User Actions */}
        {!isAuthenticated && (
          <div className="ms-auto flex items-center gap-2">
            {/* Mobile marketing menu */}
            <div className="md:hidden">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("nav.openMenu")}
                    title={t("nav.openMenu")}
                  >
                    <AlignJustify className="size-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem asChild>
                    <Link to="/about" className="w-full cursor-pointer">
                      {t("marketing.about")}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/features" className="w-full cursor-pointer">
                      {t("marketing.features")}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/pricing" className="w-full cursor-pointer">
                      {t("marketing.pricing")}
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <LoginDialog
              triggerLabel={t("auth.login")}
              open={authDialog === "login"}
              onOpenChange={(open: boolean) => {
                setAuthDialog(open ? "login" : null);
              }}
              onSwitchToSignup={() => setAuthDialog("signup")}
            />
            <SignupDialog
              triggerLabel={t("auth.signup")}
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
          <div className="ms-auto">
            <IconButton
              type="button"
              variant="ghost"
              size="icon"
              label={t("navbar.moreOptions")}
              shortcut="M"
            >
              <Ellipsis className="size-5" />
            </IconButton>
          </div>
        )}

        {isAuthenticated && !userLoading && !user && (
          <div className="ms-auto flex items-center gap-1.5 sm:gap-3">
            {location.pathname === "/" && (
              <>
                <FileUploadDialog
                  trigger={
                    <Button variant="ghost" size="sm" className="gap-2">
                      <BadgePlus className="size-5" />
                      <span className="hidden sm:inline">{t("paths.new")}</span>
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
                        <span className="hidden sm:inline">{t("paths.inProgress")}</span>
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

      {isAuthenticated && isHome && (
        <div id="home-tabs-navbar-slot" />
      )}
    </nav>
  );
}
