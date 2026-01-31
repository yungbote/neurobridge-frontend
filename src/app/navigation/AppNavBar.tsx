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
  MessageSquare,
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
import { useChatDock } from "@/app/providers/ChatDockProvider";
import { Container } from "@/shared/layout/Container";
import { useSidebar } from "@/shared/ui/sidebar";
import { cn } from "@/shared/lib/utils";
import { m } from "framer-motion";
import { nbTransitions } from "@/shared/motion/presets";
import { useI18n } from "@/app/providers/I18nProvider";
import { Skeleton } from "@/shared/ui/skeleton";

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
  const { open: chatDockOpen, setOpen: setChatDockOpen } = useChatDock();
  const { t } = useI18n();
  const [authDialog, setAuthDialog] = useState<"login" | "signup" | null>(null);
  const { state, useSheet } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [navElevated, setNavElevated] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;

    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        const scrollTop = window.scrollY || document.documentElement.scrollTop || 0;
        setNavElevated(scrollTop > 4);
      });
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, []);

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
  const showChatDockToggle = isAuthenticated && !location.pathname.startsWith("/chat");
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
      className={cn(
        "sticky top-0 z-50 w-full border-b safe-area-inset-top nb-motion motion-reduce:transition-none",
        navElevated
          ? "border-border/40 bg-background/95 backdrop-blur-lg supports-[backdrop-filter]:bg-background/90 shadow-[0_10px_24px_-22px_rgba(0,0,0,0.12)] dark:shadow-[0_10px_28px_-22px_rgba(0,0,0,0.38)]"
          : "border-transparent bg-background"
      )}
    >
      <Container
        as="div"
        size={isAuthenticated ? "app" : "lg"}
        className="relative flex h-14 sm:h-16 items-center gap-2 sm:gap-3"
      >
        {/* LEFT: Sidebar Trigger + Logo */}
        <div className="flex items-center gap-2">
          {isAuthenticated && isCollapsed && useSheet && (
            <SidebarTrigger
              aria-label={t("sidebar.expand")}
              style={{ cursor: useSheet ? "pointer" : "e-resize" }}
            />
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
          <div className="flex flex-1 justify-center overflow-hidden">
            <div
              role="tablist"
              aria-label={t("paths.sections")}
              className="flex max-w-full items-center gap-0.5 sm:gap-1 overflow-x-auto rounded-full border border-border/60 bg-muted/40 p-0.5 sm:p-1 shadow-sm backdrop-blur-lg scrollbar-none touch-pan-x"
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
                      // Touch-friendly sizing and interaction
                      "inline-flex items-center gap-1.5 sm:gap-2 rounded-full",
                      "px-2.5 py-2 sm:px-3.5 sm:py-2",
                      "min-h-[40px] sm:min-h-[36px]",
                      "text-xs sm:text-sm font-medium",
                      // Animation and focus
                      "nb-motion-fast motion-reduce:transition-none",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30",
                      "active:scale-[0.97] touch-manipulation -webkit-tap-highlight-color-transparent",
                      // Active/inactive states
                      isActive
                        ? "bg-foreground text-background shadow-sm"
                        : "text-muted-foreground hover:text-foreground hover:bg-background/70 active:bg-background/80"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="whitespace-nowrap hidden xs:inline">{t(tab.labelKey)}</span>
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
          <div className="ms-auto flex items-center gap-2">
            {showChatDockToggle ? (
              <IconButton
                type="button"
                variant="ghost"
                size="icon"
                label={chatDockOpen ? t("chat.panel.close") : t("chat.panel.open")}
                aria-pressed={chatDockOpen}
                onClick={() => setChatDockOpen(!chatDockOpen)}
                className={cn(
                  "rounded-md transition-colors",
                  chatDockOpen
                    ? "bg-muted/70 text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
              >
                <MessageSquare className="size-5" />
              </IconButton>
            ) : null}
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

        {isAuthenticated && userLoading && (
          <div className="ms-auto flex items-center gap-2" aria-hidden="true">
            <Skeleton className="h-9 w-9 rounded-full" />
            <Skeleton className="hidden h-9 w-24 rounded-full sm:block" />
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
