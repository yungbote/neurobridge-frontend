import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { NavigationTabs } from "@/features/home/components/NavigationTabs";
import { HomeTabContent } from "@/features/home/components/HomeTabContent";
import { AnimatedChatbar } from "@/features/chat/components/AnimatedChatbar";
import { useAuth } from "@/app/providers/AuthProvider";
import { useUser } from "@/app/providers/UserProvider";
import { usePaths } from "@/app/providers/PathProvider";
import { useMaterials } from "@/app/providers/MaterialProvider";
import { useSSEContext } from "@/app/providers/SSEProvider";
import { useHomeChatbarDock } from "@/app/providers/HomeChatbarDockProvider";
import { Bookmark, CheckCircle2, Clock, History, Home } from "lucide-react";
import { Container } from "@/shared/layout/Container";
import { Button } from "@/shared/ui/button";
import { Skeleton } from "@/shared/ui/skeleton";
import { cn } from "@/shared/lib/utils";
import { getLibraryTaxonomySnapshot } from "@/shared/api/LibraryService";
import { getHomeSectionIcon } from "@/features/home/lib/homeSectionIcons";
import { queryKeys } from "@/shared/query/queryKeys";
import { useI18n } from "@/app/providers/I18nProvider";
import type { HomeTabKey } from "@/features/home/components/HomeTabContent";
import type { JobEventPayload, LibraryTaxonomySnapshotV1, SseMessage } from "@/shared/types/models";

function asJobPayload(value: SseMessage["data"]): JobEventPayload | null {
  if (!value || typeof value !== "object") return null;
  return value as JobEventPayload;
}

type HomeTopicFocus = { nodeId: string; title: string; iconKey?: string };

function HomeTabTopicIcon({
  iconKey,
  onReturnHome,
}: {
  iconKey?: string;
  onReturnHome: () => void;
}) {
  const { t } = useI18n();
  const TopicIcon = getHomeSectionIcon(iconKey) ?? Home;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onReturnHome();
      }}
      className={cn(
        "group/topic relative inline-flex shrink-0 items-center justify-center rounded-full text-muted-foreground",
        // Touch-friendly sizing (44px on mobile, 32px on desktop)
        "h-11 w-11 sm:h-8 sm:w-8",
        // Transitions
        "nb-motion-fast motion-reduce:transition-none",
        // Hover/focus states
        "hover:bg-muted/40 hover:text-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30",
        // Touch optimizations
        "touch-manipulation -webkit-tap-highlight-color-transparent",
        "active:scale-95 active:bg-muted/60"
      )}
      title={t("home.backToHome")}
      aria-label={t("home.backToHome")}
    >
      <TopicIcon className="h-5 w-5 opacity-100 nb-motion-fast motion-reduce:transition-none group-hover/topic:opacity-0" />
      <Home className="absolute h-5 w-5 opacity-0 nb-motion-fast motion-reduce:transition-none group-hover/topic:opacity-100" />
    </button>
  );
}

export function HomePageSkeleton({ embedded = false }: { embedded?: boolean } = {}) {
  const body = (
    <>
      <Container size="app" className="page-pad">
        <div className="flex flex-col gap-3 items-center text-center">
          <Skeleton className="h-12 w-[min(560px,85vw)] rounded-2xl bg-muted/30" />
          <Skeleton className="h-5 w-[min(720px,92vw)] rounded-full bg-muted/30" />
        </div>
      </Container>
      <Container size="app" className="page-pad">
        <div className="space-y-4">
          <Skeleton className="h-14 w-full rounded-3xl bg-muted/20" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              // eslint-disable-next-line react/no-array-index-key
              <Skeleton key={i} className="h-36 w-full rounded-2xl bg-muted/20" />
            ))}
          </div>
        </div>
      </Container>
    </>
  );

  if (embedded) return <div aria-busy="true">{body}</div>;

  return (
    <div className="page-surface" aria-busy="true">
      {body}
    </div>
  );
}

export default function HomePage() {
  const { isAuthenticated, logout } = useAuth();
  const { user, loading: userLoading, reload: reloadUser } = useUser();
  const queryClient = useQueryClient();
  const { t } = useI18n();

  const { paths, loading: pathsLoading } = usePaths();
  const { files: materialFiles, loading: materialsLoading } = useMaterials();
  const { lastMessage } = useSSEContext();
  const { docked: chatbarDocked, setDocked: setChatbarDocked } = useHomeChatbarDock();
  const [navbarTabsSlotEl, setNavbarTabsSlotEl] = useState<HTMLElement | null>(() => {
    if (typeof document === "undefined") return null;
    return document.getElementById("home-tabs-navbar-slot");
  });
  const [homeChatbarSlotEl, setHomeChatbarSlotEl] = useState<HTMLDivElement | null>(null);
  const [homeTabsSlotEl, setHomeTabsSlotEl] = useState<HTMLDivElement | null>(null);
  const [navbarChatbarSlotEl, setNavbarChatbarSlotEl] = useState<HTMLElement | null>(null);
  const [chatbarPortalEl, setChatbarPortalEl] = useState<HTMLDivElement | null>(null);
  const [tabsPortalEl, setTabsPortalEl] = useState<HTMLDivElement | null>(null);
  const [homeChatbarHeight, setHomeChatbarHeight] = useState<number>(0);
  const [homeTabsHeight, setHomeTabsHeight] = useState<number>(0);
  const [tabsDocked, setTabsDocked] = useState(false);

  const [activeTab, setActiveTab] = useState<HomeTabKey>("home");
  const [homeTopicFocus, setHomeTopicFocus] = useState<HomeTopicFocus | null>(null);
  const homeContentTopRef = useRef<HTMLDivElement | null>(null);
  const homeTopicReturnScrollYRef = useRef<number | null>(null);

  // Track dock state to preserve across tab changes
  const keepDockedRef = useRef<{ chatbar: boolean; tabs: boolean } | null>(null);
  // Lock to prevent scroll effect from overriding dock state during tab transition
  const transitionLockRef = useRef(false);

  const setHomeChatbarSlotRef = useCallback((el: HTMLDivElement | null) => {
    setHomeChatbarSlotEl(el);
  }, []);
  const setHomeTabsSlotRef = useCallback((el: HTMLDivElement | null) => {
    setHomeTabsSlotEl(el);
  }, []);

  const handleTabChange = useCallback(
    (nextTab: HomeTabKey) => {
      if (nextTab === activeTab) return;

      // Store current dock state to restore after tab content renders
      if (chatbarDocked || tabsDocked) {
        keepDockedRef.current = { chatbar: chatbarDocked, tabs: tabsDocked };
        transitionLockRef.current = true;
      } else {
        keepDockedRef.current = null;
      }

      if (nextTab !== "home") {
        setHomeTopicFocus(null);
        homeTopicReturnScrollYRef.current = null;
      }
      setActiveTab(nextTab);
    },
    [activeTab, chatbarDocked, tabsDocked]
  );

  const handleHomeTopicViewAll = useCallback((focus: HomeTopicFocus) => {
    if (typeof window !== "undefined") {
      homeTopicReturnScrollYRef.current = window.scrollY;
    }
    setHomeTopicFocus(focus);
    requestAnimationFrame(() => {
      homeContentTopRef.current?.scrollIntoView({ behavior: "auto", block: "start" });
    });
  }, []);

  // After tab change, restore dock state (runs synchronously before paint)
  useLayoutEffect(() => {
    const keepDocked = keepDockedRef.current;
    if (!keepDocked) return;

    if (typeof window === "undefined" || typeof document === "undefined") return;

    // Restore dock states immediately
    if (keepDocked.chatbar) setChatbarDocked(true);
    if (keepDocked.tabs) setTabsDocked(true);
  }, [activeTab, setChatbarDocked]);

  // After tab change AND dock states applied, scroll content to navbar
  useEffect(() => {
    const keepDocked = keepDockedRef.current;

    if (!keepDocked) {
      // Nothing was docked, scroll to top
      if (typeof window !== "undefined") {
        window.scrollTo({ top: 0, behavior: "auto" });
      }
      return;
    }
    keepDockedRef.current = null;

    if (typeof window === "undefined" || typeof document === "undefined") return;

    // Wait for React to apply dock state updates, then scroll content under navbar
    setTimeout(() => {
      const nav = document.getElementById("app-navbar");
      const navH = nav?.getBoundingClientRect().height ?? 56;

      // Use the tabs slot as the reference point - scroll so its bottom aligns with navbar bottom
      // This hides the welcome message, chatbar slot, and tabs slot placeholder
      const tabsSlot = homeTabsSlotEl;
      if (tabsSlot) {
        const tabsSlotRect = tabsSlot.getBoundingClientRect();
        const tabsSlotBottom = tabsSlotRect.bottom + window.scrollY;
        const targetScroll = Math.max(0, tabsSlotBottom - navH);

        window.scrollTo({ top: targetScroll, behavior: "auto" });
      }

      // Clear the lock
      requestAnimationFrame(() => {
        transitionLockRef.current = false;
      });
    }, 100);
  }, [activeTab, homeTabsSlotEl]);

  const taxonomyReloadKey = useMemo(() => {
    const list = Array.isArray(paths) ? paths : [];
    // Re-fetch taxonomy after path list changes (e.g., new path generated / avatar updated).
    return list
      .filter((p) => String(p?.status || "").toLowerCase() === "ready")
      .map((p) => `${p.id}:${p.updatedAt || p.createdAt || ""}`)
      .join("|");
  }, [paths]);

  const taxonomyQuery = useQuery({
    queryKey: queryKeys.libraryTaxonomySnapshot(),
    enabled: isAuthenticated,
    queryFn: getLibraryTaxonomySnapshot,
    staleTime: 30_000,
  });

  const taxonomySnapshot: LibraryTaxonomySnapshotV1 | null = isAuthenticated
    ? (taxonomyQuery.data ?? null)
    : null;
  const taxonomyLoading = Boolean(isAuthenticated && taxonomyQuery.isPending);

  useEffect(() => {
    if (!isAuthenticated) return;
    void queryClient.invalidateQueries({ queryKey: queryKeys.libraryTaxonomySnapshot(), exact: true });
  }, [isAuthenticated, queryClient, taxonomyReloadKey]);

  // Taxonomy updates are produced by async jobs; refresh the snapshot on taxonomy job completion.
  useEffect(() => {
    if (!isAuthenticated) return;
    if (!user?.id) return;
    if (!lastMessage) return;
    if (lastMessage.channel !== user.id) return;

    const event = String(lastMessage.event || "").toLowerCase();
    if (event !== "jobdone") return;

    const payload = asJobPayload(lastMessage.data);
    if (!payload) return;
    const job = payload.job as { job_type?: string; jobType?: string } | undefined;
    const jobType = String(payload.job_type ?? job?.job_type ?? job?.jobType ?? "").toLowerCase();
    if (jobType !== "library_taxonomy_route" && jobType !== "library_taxonomy_refine") return;

    void queryClient.invalidateQueries({ queryKey: queryKeys.libraryTaxonomySnapshot(), exact: true });
  }, [isAuthenticated, lastMessage, queryClient, user?.id]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const el = document.getElementById("home-chatbar-navbar-slot");
    setNavbarChatbarSlotEl(el);
  }, []);

  useLayoutEffect(() => {
    if (typeof document === "undefined") return;
    const el = document.getElementById("home-tabs-navbar-slot");
    if (el) setNavbarTabsSlotEl(el);
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const el = document.createElement("div");
    el.setAttribute("data-home-chatbar-portal", "true");
    setChatbarPortalEl(el);
    return () => {
      try {
        el.remove();
      } catch (err) {
        void err;
      }
    };
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const el = document.createElement("div");
    el.setAttribute("data-home-tabs-portal", "true");
    setTabsPortalEl(el);
    return () => {
      try {
        el.remove();
      } catch (err) {
        void err;
      }
    };
  }, []);

  useLayoutEffect(() => {
    const target = chatbarDocked ? navbarChatbarSlotEl : homeChatbarSlotEl;
    if (!chatbarPortalEl || !target) return;
    if (chatbarPortalEl.parentElement === target) return;
    target.appendChild(chatbarPortalEl);
  }, [chatbarDocked, chatbarPortalEl, homeChatbarSlotEl, navbarChatbarSlotEl]);

  useLayoutEffect(() => {
    const target = tabsDocked ? navbarTabsSlotEl : homeTabsSlotEl;
    if (!tabsPortalEl || !target) return;
    if (tabsPortalEl.parentElement === target) return;
    target.appendChild(tabsPortalEl);
  }, [homeTabsSlotEl, navbarTabsSlotEl, tabsDocked, tabsPortalEl]);

  useEffect(() => {
    if (!homeChatbarSlotEl) return;
    if (typeof ResizeObserver === "undefined") return;
    if (chatbarDocked) return;

    const ro = new ResizeObserver(() => {
      const h = homeChatbarSlotEl.getBoundingClientRect().height;
      if (Number.isFinite(h) && h > 0) setHomeChatbarHeight(h);
    });
    ro.observe(homeChatbarSlotEl);
    return () => ro.disconnect();
  }, [chatbarDocked, homeChatbarSlotEl]);

  useEffect(() => {
    if (!homeTabsSlotEl) return;
    if (typeof ResizeObserver === "undefined") return;
    if (tabsDocked) return;

    const ro = new ResizeObserver(() => {
      const h = homeTabsSlotEl.getBoundingClientRect().height;
      if (Number.isFinite(h) && h > 0) setHomeTabsHeight(h);
    });
    ro.observe(homeTabsSlotEl);
    return () => ro.disconnect();
  }, [homeTabsSlotEl, tabsDocked]);

  // Unified scroll effect for consistent dock/undock of both chatbar and tabs
  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    if (!homeChatbarSlotEl && !homeTabsSlotEl) return;

    let raf: number | null = null;
    const hysteresisPx = 10;

    const compute = () => {
      raf = null;

      // Skip during tab transitions to preserve dock state
      if (transitionLockRef.current) return;

      const nav = document.getElementById("app-navbar");
      const navH = nav?.getBoundingClientRect().height ?? 56;

      // Compute chatbar dock state
      if (homeChatbarSlotEl) {
        const chatbarRect = homeChatbarSlotEl.getBoundingClientRect();
        const shouldDockChatbar = (() => {
          if (!chatbarDocked) return chatbarRect.top <= navH - hysteresisPx;
          return chatbarRect.top <= navH + hysteresisPx;
        })();
        if (!chatbarDocked && shouldDockChatbar && homeChatbarHeight <= 0) {
          const h = chatbarRect.height;
          if (Number.isFinite(h) && h > 0) setHomeChatbarHeight(h);
        }
        if (shouldDockChatbar !== chatbarDocked) setChatbarDocked(shouldDockChatbar);
      }

      // Compute tabs dock state
      if (homeTabsSlotEl) {
        if (!navbarTabsSlotEl) {
          if (tabsDocked) setTabsDocked(false);
        } else {
          const tabsRect = homeTabsSlotEl.getBoundingClientRect();
          const shouldDockTabs = (() => {
            if (!tabsDocked) return tabsRect.top <= navH - hysteresisPx;
            return tabsRect.top <= navH + hysteresisPx;
          })();
          if (!tabsDocked && shouldDockTabs && homeTabsHeight <= 0) {
            const h = tabsRect.height;
            if (Number.isFinite(h) && h > 0) setHomeTabsHeight(h);
          }
          if (shouldDockTabs !== tabsDocked) setTabsDocked(shouldDockTabs);
        }
      }
    };

    const onScroll = () => {
      if (raf != null) return;
      raf = window.requestAnimationFrame(compute);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    compute();

    return () => {
      if (raf != null) window.cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [
    chatbarDocked,
    homeChatbarHeight,
    homeChatbarSlotEl,
    homeTabsHeight,
    homeTabsSlotEl,
    navbarTabsSlotEl,
    setChatbarDocked,
    tabsDocked,
  ]);

  useEffect(() => {
    return () => setChatbarDocked(false);
  }, [setChatbarDocked]);

  if (!isAuthenticated) return null;

  if (userLoading) {
    return <HomePageSkeleton />;
  }

  if (!user) {
    return (
      <div className="page-surface">
        <Container size="app" className="page-pad">
          <div className="mx-auto max-w-xl space-y-4">
            <div className="text-lg font-semibold text-foreground">{t("common.failed")}</div>
            <div className="text-sm text-muted-foreground">{t("common.errorGeneric")}</div>
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => void reloadUser()}>{t("common.retry")}</Button>
              <Button variant="outline" onClick={() => void logout()}>
                {t("user.logout")}
              </Button>
            </div>
          </div>
        </Container>
      </div>
    );
  }

  const handleSubmit = (message: string) => {
    console.log("Submitted:", message);
  }

  const firstName =
    user.firstName && user.firstName.length > 0
      ? user.firstName.charAt(0).toUpperCase() + user.firstName.slice(1)
      : user.email;
  const currentHour = new Date().getHours();
  const greeting =
    currentHour < 12
      ? t("home.greeting.morning", { name: firstName })
      : currentHour < 18
        ? t("home.greeting.afternoon", { name: firstName })
        : t("home.greeting.evening", { name: firstName });
  const pathList = Array.isArray(paths) ? paths : [];
  const materialList = Array.isArray(materialFiles) ? materialFiles : [];
  const isEmptyHome = !pathsLoading && !materialsLoading && pathList.length === 0 && materialList.length === 0;

  useEffect(() => {
    if (!isEmptyHome) return;
    if (activeTab !== "home") setActiveTab("home");
    if (homeTopicFocus) setHomeTopicFocus(null);
  }, [activeTab, homeTopicFocus, isEmptyHome]);

  useLayoutEffect(() => {
    if (!isEmptyHome) return;
    if (chatbarDocked) setChatbarDocked(false);
    if (tabsDocked) setTabsDocked(false);
    if (homeChatbarHeight) setHomeChatbarHeight(0);
    if (homeTabsHeight) setHomeTabsHeight(0);
  }, [
    chatbarDocked,
    homeChatbarHeight,
    homeTabsHeight,
    isEmptyHome,
    setChatbarDocked,
    tabsDocked,
  ]);

  const tabs: { id: HomeTabKey; label: string; icon?: React.ReactNode }[] = [
    homeTopicFocus && activeTab === "home"
      ? {
          id: "home",
          label: homeTopicFocus.title,
          icon: (
            <HomeTabTopicIcon
              iconKey={homeTopicFocus.iconKey}
              onReturnHome={() => {
                setHomeTopicFocus(null);
                const y = homeTopicReturnScrollYRef.current;
                homeTopicReturnScrollYRef.current = null;
                if (typeof window === "undefined" || y == null) return;
                requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo({ top: y, behavior: "auto" })));
              }}
            />
          ),
        }
      : { id: "home", label: t("nav.home") },
    { id: "in-progress", label: t("home.tabs.inProgress"), icon: <Clock className="size-5" /> },
    { id: "saved", label: t("home.tabs.saved"), icon: <Bookmark className="size-5" /> },
    { id: "completed", label: t("home.tabs.completed"), icon: <CheckCircle2 className="size-5" /> },
    { id: "recently-viewed", label: t("home.tabs.recentlyViewed"), icon: <History className="size-5" /> },
  ];

  return (
    <div className={cn(isEmptyHome ? "h-full overflow-hidden bg-background" : "page-surface")}>
      {isEmptyHome ? (
        <div className="h-full overflow-hidden flex flex-col justify-center pb-72 sm:pb-96">
          <Container size="max-w-4xl" className="pb-4 sm:pb-5">
            <div className="flex flex-col gap-2 xs:gap-2.5 sm:gap-3 items-center text-center">
              <h1
                className={cn(
                  "font-brand text-balance break-words font-medium tracking-tight text-foreground",
                  "text-2xl xs:text-3xl sm:text-4xl md:text-[44px] lg:text-5xl"
                )}
              >
                {greeting}
              </h1>
            </div>
          </Container>

          <div className="pt-4 sm:pt-5">
            <div ref={setHomeChatbarSlotRef} />
            {chatbarPortalEl
              ? createPortal(
                  <AnimatedChatbar onSubmit={handleSubmit} respectReducedMotion={false} variant="default" />,
                  chatbarPortalEl
                )
              : null}
          </div>
        </div>
      ) : (
        <>
          <Container size="max-w-4xl" className="pt-10 sm:pt-16 pb-4 sm:pb-5">
            <div className="flex flex-col gap-2 xs:gap-2.5 sm:gap-3 items-center text-center">
              <h1
                className={cn(
                  "font-brand text-balance break-words font-medium tracking-tight text-foreground",
                  "text-2xl xs:text-3xl sm:text-4xl md:text-[44px] lg:text-5xl"
                )}
              >
                {greeting}
              </h1>
            </div>
          </Container>

          <div className={cn("pt-3 sm:pt-4", chatbarDocked ? "pb-8 sm:pb-10" : "pb-12 sm:pb-16")}>
            <div
              ref={setHomeChatbarSlotRef}
              style={
                chatbarDocked && homeChatbarHeight > 0
                  ? { minHeight: `${homeChatbarHeight}px` }
                  : undefined
              }
            />
            {chatbarPortalEl
              ? createPortal(
                  <AnimatedChatbar
                    onSubmit={handleSubmit}
                    respectReducedMotion={false}
                    variant={chatbarDocked ? "navbar" : "default"}
                  />,
                  chatbarPortalEl
                )
              : null}
          </div>

          <div
            ref={setHomeTabsSlotRef}
            style={
              tabsDocked && homeTabsHeight > 0
                ? { minHeight: `${homeTabsHeight}px` }
                : undefined
            }
          />
          {tabsPortalEl
            ? createPortal(
                <NavigationTabs
                  tabs={tabs}
                  activeTab={activeTab}
                  onTabChange={handleTabChange}
                  variant={tabsDocked ? "navbar" : "page"}
                />,
                tabsPortalEl
              )
            : null}

          <Container
            size="app"
            className="page-pad"
            style={
              tabsDocked
                ? { minHeight: "calc(100vh - 56px)" }
                : undefined
            }
          >
            <div ref={homeContentTopRef} className="scroll-mt-24" />
            <HomeTabContent
              activeTab={activeTab}
              paths={pathList}
              materialFiles={materialList}
              loading={pathsLoading}
              materialsLoading={materialsLoading}
              taxonomySnapshot={taxonomySnapshot}
              taxonomyLoading={taxonomyLoading}
              homeTopicFocus={activeTab === "home" ? homeTopicFocus : null}
              onHomeTopicViewAll={handleHomeTopicViewAll}
            />
          </Container>
        </>
      )}
    </div>
  );
}
