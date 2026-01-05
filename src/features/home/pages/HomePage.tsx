import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { NavigationTabs } from "@/features/home/components/NavigationTabs";
import { HomeTabContent } from "@/features/home/components/HomeTabContent";
import { AnimatedChatbar } from "@/features/chat/components/AnimatedChatbar";
import { useAuth } from "@/app/providers/AuthProvider";
import { useUser } from "@/app/providers/UserProvider";
import { usePaths } from "@/app/providers/PathProvider";
import { useMaterials } from "@/app/providers/MaterialProvider";
import { useSSEContext } from "@/app/providers/SSEProvider";
import { useHomeChatbarDock } from "@/app/providers/HomeChatbarDockProvider";
import { Clock, Bookmark, CheckCircle2, History } from "lucide-react";
import { Container } from "@/shared/layout/Container";
import { getLibraryTaxonomySnapshot } from "@/shared/api/LibraryService";
import type { HomeTabKey } from "@/features/home/components/HomeTabContent";
import type { JobEventPayload, LibraryTaxonomySnapshotV1, SseMessage } from "@/shared/types/models";

function asJobPayload(value: SseMessage["data"]): JobEventPayload | null {
  if (!value || typeof value !== "object") return null;
  return value as JobEventPayload;
}

export default function HomePage() {
  const { isAuthenticated } = useAuth();
  const { user, loading: userLoading } = useUser();

  const { paths, loading: pathsLoading } = usePaths();
  const { files: materialFiles, loading: materialsLoading } = useMaterials();
  const { lastMessage } = useSSEContext();
  const { docked: chatbarDocked, setDocked: setChatbarDocked } = useHomeChatbarDock();
  const [navbarTabsSlotEl, setNavbarTabsSlotEl] = useState<HTMLElement | null>(() => {
    if (typeof document === "undefined") return null;
    return document.getElementById("home-tabs-navbar-slot");
  });
  const [taxonomySnapshot, setTaxonomySnapshot] = useState<LibraryTaxonomySnapshotV1 | null>(null);
  const [taxonomyLoading, setTaxonomyLoading] = useState(false);
  const [homeChatbarSlotEl, setHomeChatbarSlotEl] = useState<HTMLDivElement | null>(null);
  const [homeTabsSlotEl, setHomeTabsSlotEl] = useState<HTMLDivElement | null>(null);
  const [navbarChatbarSlotEl, setNavbarChatbarSlotEl] = useState<HTMLElement | null>(null);
  const [chatbarPortalEl, setChatbarPortalEl] = useState<HTMLDivElement | null>(null);
  const [tabsPortalEl, setTabsPortalEl] = useState<HTMLDivElement | null>(null);
  const [homeChatbarHeight, setHomeChatbarHeight] = useState<number>(0);
  const [homeTabsHeight, setHomeTabsHeight] = useState<number>(0);
  const [tabsDocked, setTabsDocked] = useState(false);

  const [activeTab, setActiveTab] = useState<HomeTabKey>("home");

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

      setActiveTab(nextTab);
    },
    [activeTab, chatbarDocked, tabsDocked]
  );

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

  useEffect(() => {
    if (!isAuthenticated) {
      setTaxonomySnapshot(null);
      setTaxonomyLoading(false);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setTaxonomyLoading(true);
      try {
        const snap = await getLibraryTaxonomySnapshot();
        if (!cancelled) setTaxonomySnapshot(snap);
      } catch (err) {
        console.error("[HomePage] Failed to load library taxonomy:", err);
        if (!cancelled) setTaxonomySnapshot(null);
      } finally {
        if (!cancelled) setTaxonomyLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, taxonomyReloadKey]);

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

    let cancelled = false;
    const reload = async () => {
      setTaxonomyLoading(true);
      try {
        const snap = await getLibraryTaxonomySnapshot();
        if (!cancelled) setTaxonomySnapshot(snap);
      } catch (err) {
        console.error("[HomePage] Failed to refresh library taxonomy:", err);
      } finally {
        if (!cancelled) setTaxonomyLoading(false);
      }
    };
    reload();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, lastMessage, user?.id]);

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

  if (!isAuthenticated || userLoading || !user) {
    return null;
  }

  const handleSubmit = (message: string) => {
    console.log("Submitted:", message);
  }

  const firstName =
    user.firstName && user.firstName.length > 0
      ? user.firstName.charAt(0).toUpperCase() + user.firstName.slice(1)
      : user.email;

  const tabs: { id: HomeTabKey; label: string; icon?: React.ReactNode }[] = [
    { id: "home", label: "Home" },
    { id: "in-progress", label: "In Progress", icon: <Clock className="size-5" /> },
    { id: "saved", label: "Saved", icon: <Bookmark className="size-5" /> },
    { id: "completed", label: "Completed", icon: <CheckCircle2 className="size-5" /> },
    { id: "recently-viewed", label: "Recently Viewed", icon: <History className="size-5" /> },
  ];

  return (
    <div className="page-surface">
      <Container className="page-pad">
        <div className="flex flex-col gap-3 items-center text-center">
          <h1 className="font-brand text-balance break-words text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            Welcome, {firstName}.
          </h1>
          <p className="max-w-xl text-pretty text-base font-medium text-foreground/80 sm:text-lg">
            Your workspace is ready. We&apos;ll keep adapting your resources and
            recommendations as you learn.
          </p>
        </div>
      </Container>

      <div className="page-pad-compact">
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
        className="page-pad"
        style={
          tabsDocked
            ? { minHeight: "calc(100vh - 56px)" }
            : undefined
        }
      >
        <HomeTabContent
          activeTab={activeTab}
          paths={paths || []}
          materialFiles={materialFiles || []}
          loading={pathsLoading}
          materialsLoading={materialsLoading}
          taxonomySnapshot={taxonomySnapshot}
          taxonomyLoading={taxonomyLoading}
        />
      </Container>
    </div>
  );
}
