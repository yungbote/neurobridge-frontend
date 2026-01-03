import React, { useEffect, useMemo, useRef, useState } from "react";
import { PathCardLarge } from "@/features/paths/components/PathCardLarge";
import { EmptyContent } from "@/shared/components/EmptyContent";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Path } from "@/shared/types/models";
import type { LibraryTaxonomySnapshotV1 } from "@/shared/types/models";

export type HomeTabKey = "home" | "in-progress" | "saved" | "completed" | "recently-viewed";

type LegacyTimestampPath = { updated_at?: string | null; created_at?: string | null };

function safeParseJSON(v: unknown): Record<string, unknown> | null {
  if (!v) return null;
  if (typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return null;
    } catch {
      return null;
    }
  }
  return null;
}

function getPathMetadata(path: Path): Record<string, unknown> | null {
  const meta = safeParseJSON(path?.metadata);
  return meta ?? null;
}

function byUpdatedDesc(a: Path, b: Path) {
  const aLegacy = a as Path & LegacyTimestampPath;
  const bLegacy = b as Path & LegacyTimestampPath;
  const ad = new Date(
    a.updatedAt || aLegacy.updated_at || a.createdAt || aLegacy.created_at || 0
  ).getTime();
  const bd = new Date(
    b.updatedAt || bLegacy.updated_at || b.createdAt || bLegacy.created_at || 0
  ).getTime();
  return bd - ad;
}

function getPathStatus(path: Path) {
  const meta = getPathMetadata(path);
  const s =
    path?.status ??
    meta?.status ??
    meta?.Status ??
    meta?.state ??
    null;
  return typeof s === "string" ? s.toLowerCase() : null;
}

function isBuildingPath(path: Path) {
  // Placeholder + job overlay always counts as in-progress.
  if (path?.jobId || path?.jobStatus || path?.jobStage) return true;
  const status = getPathStatus(path);
  return status !== "ready";
}

function filterPathsByTab(paths: Path[], activeTab: HomeTabKey) {
  const list = Array.isArray(paths) ? paths : [];

  switch (activeTab) {
    case "in-progress":
      return list.filter((c) => {
        return isBuildingPath(c);
      });

    case "completed":
      return list.filter((p) => getPathStatus(p) === "ready" && !isBuildingPath(p));

    case "saved":
      return list.filter((c) => {
        const meta = getPathMetadata(c);
        return meta?.saved === true;
      });

    case "recently-viewed":
      return list.slice().sort(byUpdatedDesc).slice(0, 12);

    case "home":
    default:
      return list.slice().sort(byUpdatedDesc);
  }
}

function emptyCopy(activeTab: HomeTabKey) {
  switch (activeTab) {
    case "in-progress":
      return {
        title: "No paths in progress",
        description: "Upload materials to start a new path build.",
      };
    case "saved":
      return {
        title: "No saved paths",
        description: "Save a path to keep it handy here.",
      };
    case "completed":
      return {
        title: "No ready paths yet",
        description: "Completed path builds will show up here.",
      };
    case "recently-viewed":
      return {
        title: "Nothing viewed recently",
        description: "Open a path to see it appear here.",
      };
    default:
      return {
        title: "No paths yet",
        description: "Upload materials to generate your first learning path.",
      };
  }
}

interface HomeTabContentProps {
  activeTab: HomeTabKey;
  paths: Path[];
  loading: boolean;
  taxonomySnapshot?: LibraryTaxonomySnapshotV1 | null;
  taxonomyLoading?: boolean;
}

type HomeRailSection = {
  id: string;
  title: string;
  paths: Path[];
};

function buildPathIndex(paths: Path[]) {
  const map = new Map<string, Path>();
  for (const p of paths || []) {
    if (!p?.id) continue;
    map.set(String(p.id), p);
  }
  return map;
}

const TOPIC_ANCHOR_KEY_ORDER = [
  "anchor_physics",
  "anchor_biology",
  "anchor_chemistry",
  "anchor_mathematics",
  "anchor_computer_science",
  "anchor_medicine_health",
  "anchor_psychology_neuroscience",
  "anchor_economics_business",
  "anchor_history",
  "anchor_philosophy",
] as const;

export function HomeTabContent({
  activeTab,
  paths,
  loading,
  taxonomySnapshot,
  taxonomyLoading,
}: HomeTabContentProps) {
  const isHome = activeTab === "home";

  const filtered = useMemo(
    () => filterPathsByTab(paths, activeTab),
    [paths, activeTab]
  );

  const homeSections = useMemo<HomeRailSection[]>(() => {
    if (!isHome) return [];

    const list = Array.isArray(paths) ? paths : [];
    const generating = list
      .filter((p) => isBuildingPath(p))
      .slice()
      .sort(byUpdatedDesc)
      .slice(0, 12);
    const newest = list
      .filter((p) => !isBuildingPath(p))
      .slice()
      .sort(byUpdatedDesc)
      .slice(0, 12);

    const sections: HomeRailSection[] = [];
    if (generating.length > 0) {
      sections.push({
        id: "generating",
        title: "Generating",
        paths: generating,
      });
    }
    sections.push({
      id: "new",
      title: "New",
      paths: newest,
    });

    const snapshot = taxonomySnapshot ?? null;
    const topic = snapshot?.facets?.topic;
    if (!topic) return sections;

    const nodes = topic.nodes || [];
    const memberships = topic.memberships || [];
    const pathsById = buildPathIndex(list);
    const membershipByNodeId = new Map(memberships.map((m) => [m.node_id, m]));

    const anchors = nodes
      .filter((n) => n?.kind === "anchor")
      .filter((n) => (n?.member_count ?? 0) > 0)
      .slice()
      .sort((a, b) => {
        const ai = TOPIC_ANCHOR_KEY_ORDER.indexOf(a.key as (typeof TOPIC_ANCHOR_KEY_ORDER)[number]);
        const bi = TOPIC_ANCHOR_KEY_ORDER.indexOf(b.key as (typeof TOPIC_ANCHOR_KEY_ORDER)[number]);
        if (ai !== -1 || bi !== -1) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
        return String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base" });
      });

    for (const node of anchors) {
      const rows = membershipByNodeId.get(node.id)?.paths || [];
      const sectionPaths = rows
        .map((r) => pathsById.get(String(r.path_id)))
        .filter(Boolean) as Path[];

      const ordered = sectionPaths.slice().sort(byUpdatedDesc);
      if (ordered.length === 0) continue;
      sections.push({
        id: node.id,
        title: node.name || "Untitled",
        paths: ordered,
      });
    }

    return sections;
  }, [isHome, paths, taxonomySnapshot]);

  if (isHome && (loading || taxonomyLoading)) {
    return (
      <div className="w-full">
        <div className="space-y-12">
          {Array.from({ length: 3 }).map((_, sectionIndex) => (
            <div key={sectionIndex} className="space-y-4">
              <div className="h-7 w-40 rounded-lg bg-muted/30" />
              <div className="relative -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
                <div className="flex gap-6 overflow-x-hidden">
                  {Array.from({ length: 3 }).map((_, cardIndex) => (
                    <div
                      key={cardIndex}
                      className="h-[280px] w-[320px] shrink-0 rounded-xl border border-border bg-muted/30 sm:w-[360px] lg:w-[420px]"
                    />
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (isHome) {
    if (!paths || paths.length === 0) {
      const copy = emptyCopy(activeTab);
      return (
        <div className="w-full">
          <EmptyContent title={copy.title} message={copy.description} helperText="" />
        </div>
      );
    }

    return (
      <div className="w-full space-y-12">
        {homeSections.map((section) => (
          <HomeRail key={section.id} title={section.title} paths={section.paths} />
        ))}
      </div>
    );
  }

  if (!filtered || filtered.length === 0) {
    const copy = emptyCopy(activeTab);
    return (
      <div className="w-full">
        <EmptyContent title={copy.title} message={copy.description} helperText="" />
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {filtered.map((path) => (
          <PathCardLarge key={path.id} path={path} />
        ))}
      </div>
    </div>
  );
}

function HomeRail({ title, paths }: { title: string; paths: Path[] }) {
  const railRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = () => {
    const el = railRef.current;
    if (!el) return;
    const maxScrollLeft = el.scrollWidth - el.clientWidth;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft < maxScrollLeft - 4);
  };

  useEffect(() => {
    updateScrollState();
    const el = railRef.current;
    if (!el) return;
    const onScroll = () => updateScrollState();
    el.addEventListener("scroll", onScroll, { passive: true });
    const ro = new ResizeObserver(() => updateScrollState());
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", onScroll);
      ro.disconnect();
    };
  }, []);

  const scrollByCards = (direction: -1 | 1) => {
    const el = railRef.current;
    if (!el) return;
    const amount = Math.max(280, Math.floor(el.clientWidth * 0.85));
    el.scrollBy({ left: direction * amount, behavior: "smooth" });
  };

  if (!paths || paths.length === 0) return null;

  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <h2 className="font-brand text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          {title}
        </h2>
      </div>

      <div className="relative -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div
          ref={railRef}
          className="scrollbar-none flex gap-6 overflow-x-auto overscroll-x-contain pb-1 scroll-smooth snap-x snap-proximity"
          style={{ WebkitOverflowScrolling: "touch" }}
          onWheel={(e) => {
            const el = e.currentTarget;
            const canScrollX = el.scrollWidth > el.clientWidth;
            if (!canScrollX) return;
            if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
            el.scrollLeft += e.deltaY;
          }}
          onScroll={updateScrollState}
        >
          {paths.map((path) => (
            <div key={path.id} className="shrink-0 snap-start w-[320px] sm:w-[360px] lg:w-[420px]">
              <PathCardLarge path={path} />
            </div>
          ))}
        </div>

        <div
          className={cn(
            "pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-background to-transparent transition-opacity",
            canScrollLeft ? "opacity-100" : "opacity-0"
          )}
        />
        <div
          className={cn(
            "pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-background to-transparent transition-opacity",
            canScrollRight ? "opacity-100" : "opacity-0"
          )}
        />

        {canScrollLeft && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute left-2 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full border border-border bg-background/80 shadow-sm backdrop-blur-sm"
            aria-label={`Scroll ${title} left`}
            onClick={() => scrollByCards(-1)}
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
        )}

        {canScrollRight && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-2 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full border border-border bg-background/80 shadow-sm backdrop-blur-sm"
            aria-label={`Scroll ${title} right`}
            onClick={() => scrollByCards(1)}
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
        )}
      </div>
    </section>
  );
}

