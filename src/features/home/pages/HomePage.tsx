import React, { useEffect, useMemo, useState } from "react";
import { NavigationTabs } from "@/features/home/components/NavigationTabs";
import { HomeTabContent } from "@/features/home/components/HomeTabContent";
import { AnimatedChatbar } from "@/features/chat/components/AnimatedChatbar";
import { useAuth } from "@/app/providers/AuthProvider";
import { useUser } from "@/app/providers/UserProvider";
import { usePaths } from "@/app/providers/PathProvider";
import { useSSEContext } from "@/app/providers/SSEProvider";
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
  const { lastMessage } = useSSEContext();
  const [taxonomySnapshot, setTaxonomySnapshot] = useState<LibraryTaxonomySnapshotV1 | null>(null);
  const [taxonomyLoading, setTaxonomyLoading] = useState(false);

  const [activeTab, setActiveTab] = useState<HomeTabKey>("home");

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
        <AnimatedChatbar onSubmit={handleSubmit} respectReducedMotion={false} />
      </div>

      <NavigationTabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

      <Container className="page-pad">
        <HomeTabContent
          activeTab={activeTab}
          paths={paths || []}
          loading={pathsLoading}
          taxonomySnapshot={taxonomySnapshot}
          taxonomyLoading={taxonomyLoading}
        />
      </Container>
    </div>
  );
}



