import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PathCardLarge } from "@/features/paths/components/PathCardLarge";
import { MaterialCardLarge } from "@/features/files/components/MaterialCardLarge";
import { EmptyContent } from "@/shared/components/EmptyContent";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/shared/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { Skeleton } from "@/shared/ui/skeleton";
import { cn } from "@/shared/lib/utils";
import {
  Atom,
  Brain,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  Cpu,
  Filter,
  FlaskConical,
  HeartPulse,
  Landmark,
  Leaf,
  ScrollText,
  Sigma,
  Sparkles,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import type { LibraryTaxonomySnapshotV1, MaterialFile, Path } from "@/shared/types/models";
import { listTaxonomyNodeItems } from "@/shared/api/LibraryService";

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
  const ad = new Date(a.updatedAt || aLegacy.updated_at || a.createdAt || aLegacy.created_at || 0).getTime();
  const bd = new Date(b.updatedAt || bLegacy.updated_at || b.createdAt || bLegacy.created_at || 0).getTime();
  return bd - ad;
}

function pathUpdatedMs(path: Path) {
  const legacy = path as Path & LegacyTimestampPath;
  const ms = new Date(path.updatedAt || legacy.updated_at || path.createdAt || legacy.created_at || 0).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function materialUpdatedMs(file: MaterialFile) {
  const ms = new Date(file?.updatedAt || file?.createdAt || 0).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function itemUpdatedMs(item: HomeCardItem) {
  return item.kind === "material" ? materialUpdatedMs(item.file) : pathUpdatedMs(item.path);
}

function byItemUpdatedDesc(a: HomeCardItem, b: HomeCardItem) {
  return itemUpdatedMs(b) - itemUpdatedMs(a);
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
  materialFiles?: MaterialFile[];
  loading: boolean;
  materialsLoading?: boolean;
  taxonomySnapshot?: LibraryTaxonomySnapshotV1 | null;
  taxonomyLoading?: boolean;
}

type HomeCardItem =
  | { kind: "path"; id: string; path: Path }
  | { kind: "material"; id: string; file: MaterialFile };

type HomeRailSection = {
  id: string;
  title: string;
  iconKey?: string;
  items: HomeCardItem[];
  nodeId?: string;
};

type HomeRailFilterValue = "all" | "paths" | "files";

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

type HomeSectionIconConfig = {
  icon: LucideIcon;
};

const HOME_SECTION_ICONS: Record<string, HomeSectionIconConfig> = {
  generating: {
    icon: CircleDashed,
  },
  new: {
    icon: Sparkles,
  },
  anchor_physics: {
    icon: Atom,
  },
  anchor_biology: {
    icon: Leaf,
  },
  anchor_chemistry: {
    icon: FlaskConical,
  },
  anchor_mathematics: {
    icon: Sigma,
  },
  anchor_computer_science: {
    icon: Cpu,
  },
  anchor_medicine_health: {
    icon: HeartPulse,
  },
  anchor_psychology_neuroscience: {
    icon: Brain,
  },
  anchor_economics_business: {
    icon: TrendingUp,
  },
  anchor_history: {
    icon: Landmark,
  },
  anchor_philosophy: {
    icon: ScrollText,
  },
};

function HomeSectionIcon({ iconKey, title }: { iconKey?: string; title: string }) {
  const key = String(iconKey || "").trim();
  const cfg = (key && HOME_SECTION_ICONS[key]) || null;
  if (!cfg) return null;
  const Icon = cfg.icon;

  return (
    <div
      aria-hidden="true"
      className={cn(
        "relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/60",
        "bg-gradient-to-br from-background/80 via-background/60 to-muted/30 shadow-sm backdrop-blur-sm",
        "ring-1 ring-inset ring-white/10 dark:ring-white/5",
        "shadow-[0_1px_0_rgba(255,255,255,0.10)_inset]"
      )}
    >
      <Icon className="h-4 w-4 text-muted-foreground" />
    </div>
  );
}

export function HomeTabContent({
  activeTab,
  paths,
  materialFiles,
  loading,
  materialsLoading,
  taxonomySnapshot,
  taxonomyLoading,
}: HomeTabContentProps) {
  const isHome = activeTab === "home";
  const materialList = materialFiles ?? [];

  const filesByMaterialSetId = useMemo(() => {
    const out = new Map<string, MaterialFile[]>();
    const list = Array.isArray(materialList) ? materialList : [];
    for (const f of list) {
      const setId = String(f?.materialSetId || "");
      if (!setId) continue;
      const arr = out.get(setId) ?? [];
      arr.push(f);
      out.set(setId, arr);
    }
    for (const arr of out.values()) {
      arr.sort((a, b) => materialUpdatedMs(b) - materialUpdatedMs(a));
    }
    return out;
  }, [materialList]);

  const filtered = useMemo(
    () => filterPathsByTab(paths, activeTab),
    [paths, activeTab]
  );

  const homeSections = useMemo<HomeRailSection[]>(() => {
    if (!isHome) return [];

    const buildItems = (sectionPaths: Path[], opts: { includeMaterials?: boolean } = {}): HomeCardItem[] => {
      const includeMaterials = opts.includeMaterials !== false;
      const out: HomeCardItem[] = [];
      const seen = new Set<string>();

      for (const p of sectionPaths || []) {
        const id = String(p?.id || "");
        if (!id) continue;
        const key = `path:${id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ kind: "path", id, path: p });
      }

      if (includeMaterials) {
        for (const p of sectionPaths || []) {
          const setId = String(p?.materialSetId || "");
          if (!setId) continue;
          const rows = filesByMaterialSetId.get(setId) ?? [];
          for (const f of rows) {
            const id = String(f?.id || "");
            if (!id) continue;
            const key = `material:${id}`;
            if (seen.has(key)) continue;
            seen.add(key);
            out.push({ kind: "material", id, file: f });
          }
        }
      }

      out.sort(byItemUpdatedDesc);
      return out;
    };

    const list = Array.isArray(paths) ? paths : [];
    const generating = list
      .filter((p) => isBuildingPath(p))
      .slice()
      .sort(byUpdatedDesc);
    const maxNewAgeDays = (() => {
      const raw = String(import.meta.env.VITE_HOME_NEW_MAX_AGE_DAYS || "7");
      const parsed = Number.parseInt(raw, 10);
      if (!Number.isFinite(parsed) || parsed < 0) return 7;
      return Math.min(parsed, 365);
    })();
    const maxNewAgeMs = maxNewAgeDays === 0 ? null : maxNewAgeDays * 24 * 60 * 60 * 1000;

    const nowMs = Date.now();
    const isUnseen = (p: Path) => {
      const count = typeof p?.viewCount === "number" ? p.viewCount : 0;
      return !p?.lastViewedAt && count <= 0;
    };
    const readyMsFor = (p: Path) => {
      const t = p?.readyAt || p?.updatedAt || p?.createdAt || null;
      const ms = t ? new Date(t).getTime() : 0;
      return Number.isFinite(ms) ? ms : 0;
    };
    const isNewPath = (p: Path) => {
      if (isBuildingPath(p)) return false;
      if (!isUnseen(p)) return false;
      if (maxNewAgeMs == null) return true;
      const readyMs = readyMsFor(p);
      if (!readyMs) return false;
      return readyMs >= nowMs - maxNewAgeMs;
    };
    const newPaths = list
      .filter((p) => isNewPath(p))
      .slice()
      .sort((a, b) => readyMsFor(b) - readyMsFor(a));

    const sections: HomeRailSection[] = [];
    if (generating.length > 0) {
      sections.push({
        id: "generating",
        title: "Generating",
        iconKey: "generating",
        items: buildItems(generating, { includeMaterials: false }),
      });
    }
    sections.push({
      id: "new",
      title: "New",
      iconKey: "new",
      items: buildItems(newPaths),
    });

    const snapshot = taxonomySnapshot ?? null;
    const topic = snapshot?.facets?.topic;
    if (!topic) return sections;

    const nodes = topic.nodes || [];
    const memberships = topic.memberships || [];
    const membershipByNodeId = new Map(memberships.map((m) => [m.node_id, m]));

    const anchorNodes = nodes
      .filter((n) => n?.kind === "anchor")
      .slice()
      .sort((a, b) => {
        const ai = TOPIC_ANCHOR_KEY_ORDER.indexOf(a.key as (typeof TOPIC_ANCHOR_KEY_ORDER)[number]);
        const bi = TOPIC_ANCHOR_KEY_ORDER.indexOf(b.key as (typeof TOPIC_ANCHOR_KEY_ORDER)[number]);
        if (ai !== -1 || bi !== -1) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
        return String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base" });
      });

    // Home grouping uses a single "primary" anchor per path so a path card appears at most once
    // across seeded topic rails. Secondary anchors can still exist in the taxonomy DAG.
    const primaryAnchorByPathId = new Map<
      string,
      { anchorId: string; weight: number; anchorKey: string }
    >();
    for (const anchor of anchorNodes) {
      const anchorId = String(anchor?.id || "");
      if (!anchorId) continue;
      const rows = membershipByNodeId.get(anchorId)?.paths || [];
      for (const r of rows) {
        const pathId = String(r?.path_id || "");
        if (!pathId) continue;
        const weight = typeof r?.weight === "number" ? r.weight : Number(r?.weight || 0);
        const existing = primaryAnchorByPathId.get(pathId);
        if (!existing || weight > existing.weight) {
          primaryAnchorByPathId.set(pathId, {
            anchorId,
            weight,
            anchorKey: String(anchor.key || ""),
          });
        }
      }
    }

    const readyList = list.filter((p) => !isBuildingPath(p));
    const readyByPrimaryAnchorId = new Map<string, Path[]>();
    for (const p of readyList) {
      const pid = String(p?.id || "");
      if (!pid) continue;
      const primary = primaryAnchorByPathId.get(pid)?.anchorId;
      if (!primary) continue;
      const arr = readyByPrimaryAnchorId.get(primary) ?? [];
      arr.push(p);
      readyByPrimaryAnchorId.set(primary, arr);
    }

    const minTopicAnchorPaths = (() => {
      const raw = String(import.meta.env.VITE_HOME_TOPIC_ANCHOR_MIN_PATHS || "2");
      const parsed = Number.parseInt(raw, 10);
      if (!Number.isFinite(parsed) || parsed < 1) return 2;
      return parsed;
    })();

    const anchorOrderIndex = new Map(
      anchorNodes
        .map((n, idx) => [String(n?.id || ""), idx] as const)
        .filter(([id]) => Boolean(id))
    );

    const topicSections: HomeRailSection[] = [];
    for (const node of anchorNodes) {
      const nodeId = String(node?.id || "");
      if (!nodeId) continue;

      const sectionPaths = readyByPrimaryAnchorId.get(nodeId) ?? [];

      const ordered = sectionPaths.slice().sort(byUpdatedDesc);
      if (ordered.length < minTopicAnchorPaths) continue;
      topicSections.push({
        id: node.id,
        nodeId,
        title: node.name || "Untitled",
        iconKey: String(node.key || ""),
        items: buildItems(ordered),
      });
    }

    topicSections.sort((a, b) => {
      const count =
        (b.items?.filter((i) => i.kind === "path").length ?? 0) -
        (a.items?.filter((i) => i.kind === "path").length ?? 0);
      if (count !== 0) return count;
      const ai = anchorOrderIndex.get(String(a.id || "")) ?? 999;
      const bi = anchorOrderIndex.get(String(b.id || "")) ?? 999;
      return ai - bi;
    });

    sections.push(...topicSections);

    return sections;
  }, [filesByMaterialSetId, isHome, paths, taxonomySnapshot]);

  if (isHome && (loading || taxonomyLoading || (materialsLoading && materialList.length === 0))) {
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
    if ((!paths || paths.length === 0) && materialList.length === 0) {
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
          <HomeRail
            key={section.id}
            title={section.title}
            iconKey={section.iconKey}
            items={section.items}
            nodeId={section.nodeId}
          />
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
      <div className="grid gap-6 grid-cols-[repeat(auto-fill,minmax(min(100%,320px),360px))]">
        {filtered.map((path) => (
          <PathCardLarge key={path.id} path={path} />
        ))}
      </div>
    </div>
  );
}

function HomeRail({
  title,
  iconKey,
  items,
  nodeId,
}: {
  title: string;
  iconKey?: string;
  items: HomeCardItem[];
  nodeId?: string;
}) {
  const railRef = useRef<HTMLDivElement | null>(null);
  const pendingAnchorRef = useRef<{ key: string; within: number } | null>(null);
  const [filter, setFilter] = useState<HomeRailFilterValue>("all");
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [hasOverflow, setHasOverflow] = useState(false);

  const isPaginated = Boolean(nodeId);
  const [loadedItems, setLoadedItems] = useState<HomeCardItem[]>(() => items || []);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [initialFetched, setInitialFetched] = useState(false);
  const loadingMoreRef = useRef(false);
  const [viewAllOpen, setViewAllOpen] = useState(false);
  const viewAllScrollRef = useRef<HTMLDivElement | null>(null);
  const viewAllSentinelRef = useRef<HTMLDivElement | null>(null);
  const [viewAllRenderCount, setViewAllRenderCount] = useState(0);

  const allItems = isPaginated ? loadedItems : items;

  const mergeIntoLoaded = useMemo(() => {
    return (prev: HomeCardItem[], incoming: HomeCardItem[]) => {
      const byKey = new Map<string, HomeCardItem>();
      for (const it of prev || []) {
        const id = String(it?.id || "");
        const kind = String(it?.kind || "");
        if (!id || !kind) continue;
        byKey.set(`${kind}:${id}`, it);
      }
      for (const it of incoming || []) {
        const id = String(it?.id || "");
        const kind = String(it?.kind || "");
        if (!id || !kind) continue;
        byKey.set(`${kind}:${id}`, it);
      }
      const out = Array.from(byKey.values());
      out.sort((a, b) => {
        const diff = itemUpdatedMs(b) - itemUpdatedMs(a);
        if (diff !== 0) return diff;
        const ar = a.kind === "material" ? 1 : 0;
        const br = b.kind === "material" ? 1 : 0;
        if (ar !== br) return ar - br;
        return String(a.id || "").localeCompare(String(b.id || ""), undefined, { sensitivity: "base" });
      });
      return out;
    };
  }, []);

  useEffect(() => {
    if (!isPaginated) return;
    setLoadedItems((prev) => mergeIntoLoaded(prev, items || []));
  }, [isPaginated, items, mergeIntoLoaded]);

  useEffect(() => {
    if (!isPaginated) return;
    // When node changes, reset pagination state.
    setLoadedItems(items || []);
    setNextCursor(null);
    setInitialFetched(false);
  }, [isPaginated, nodeId]); // eslint-disable-line react-hooks/exhaustive-deps

  const counts = useMemo(() => {
    let paths = 0;
    let files = 0;
    for (const item of allItems || []) {
      if (item.kind === "path") paths++;
      if (item.kind === "material") files++;
    }
    return { paths, files, total: paths + files };
  }, [allItems]);

  const visibleItems = useMemo(() => {
    const list = allItems || [];
    if (filter === "paths") return list.filter((i) => i.kind === "path");
    if (filter === "files") return list.filter((i) => i.kind === "material");
    return list;
  }, [filter, allItems]);

  const [cardWidth, setCardWidth] = useState<number>(() => {
    if (typeof window === "undefined" || typeof window.matchMedia === "undefined") return 320;
    return window.matchMedia("(min-width: 640px)").matches ? 360 : 320;
  });
  const gapPx = 24;
  const stridePx = cardWidth + gapPx;
  const overscan = 2;
  const rafRef = useRef<number | null>(null);
  const tailSkeletonCount = loadingMore ? 2 : 0;
  const displayCount = visibleItems.length + tailSkeletonCount;
  const [range, setRange] = useState<{ start: number; end: number }>(() => ({
    start: 0,
    end: Math.min(visibleItems.length, 8),
  }));

  const fetchMore = useCallback(async () => {
    const nid = String(nodeId || "");
    if (!nid) return;
    if (loadingMoreRef.current) return;
    if (initialFetched && !nextCursor) return;

    loadingMoreRef.current = true;
    const el = railRef.current;
    if (el && el.scrollLeft > 1 && visibleItems.length > 0) {
      const idx = Math.max(0, Math.min(visibleItems.length - 1, Math.floor(el.scrollLeft / stridePx)));
      const anchor = visibleItems[idx];
      if (anchor) {
        pendingAnchorRef.current = {
          key: `${anchor.kind}:${anchor.id}`,
          within: el.scrollLeft - idx * stridePx,
        };
      }
    }

    setLoadingMore(true);
    try {
      const { items: incoming, nextCursor: cursor } = await listTaxonomyNodeItems(nid, {
        facet: "topic",
        filter: "all",
        limit: 48,
        cursor: initialFetched ? nextCursor : null,
      });
      const mapped: HomeCardItem[] = incoming.map((it) => {
        if (it.kind === "path") return { kind: "path", id: String(it.path.id), path: it.path };
        return { kind: "material", id: String(it.file.id), file: it.file };
      });
      setLoadedItems((prev) => mergeIntoLoaded(prev, mapped));
      setNextCursor(cursor);
      setInitialFetched(true);
    } catch (err) {
      console.warn("[HomeRail] Failed to load more items:", err);
      setInitialFetched(true);
      setNextCursor(null);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [initialFetched, mergeIntoLoaded, nextCursor, nodeId, stridePx, visibleItems]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia === "undefined") return;
    const mql = window.matchMedia("(min-width: 640px)");
    const onChange = () => setCardWidth(mql.matches ? 360 : 320);
    onChange();
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    }
    // Safari < 14
    // eslint-disable-next-line deprecation/deprecation
    mql.addListener(onChange);
    // eslint-disable-next-line deprecation/deprecation
    return () => mql.removeListener(onChange);
  }, []);

  const updateVirtualRange = () => {
    const el = railRef.current;
    if (!el) return;
    const count = displayCount;
    if (count <= 0) {
      setRange({ start: 0, end: 0 });
      return;
    }
    const start = Math.max(0, Math.floor(el.scrollLeft / stridePx) - overscan);
    const end = Math.min(
      count,
      Math.ceil((el.scrollLeft + el.clientWidth) / stridePx) + overscan
    );
    setRange((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
  };

  const maybeLoadMore = () => {
    if (!isPaginated) return;
    if (loadingMore) return;
    if (initialFetched && !nextCursor) return;
    const el = railRef.current;
    if (!el) return;
    const count = visibleItems.length;
    if (count <= 0) return;
    const totalWidth = count * stridePx - gapPx;
    if (el.scrollLeft + el.clientWidth >= totalWidth - stridePx * 2) {
      void fetchMore();
    }
  };

  const scheduleUpdate = () => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      updateScrollState();
      updateVirtualRange();
      maybeLoadMore();
    });
  };

  const updateScrollState = () => {
    const el = railRef.current;
    if (!el) return;
    const maxScrollLeft = el.scrollWidth - el.clientWidth;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft < maxScrollLeft - 4);
    setHasOverflow(maxScrollLeft > 4);
  };

  useEffect(() => {
    scheduleUpdate();
    const el = railRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => scheduleUpdate());
    ro.observe(el);
    return () => {
      ro.disconnect();
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleItems.length, cardWidth, isPaginated, nextCursor, loadingMore]);

  const scrollByCards = (direction: -1 | 1) => {
    const el = railRef.current;
    if (!el) return;
    const amount = Math.max(280, Math.floor(el.clientWidth * 0.85));
    el.scrollBy({ left: direction * amount, behavior: "smooth" });
  };

  useEffect(() => {
    const el = railRef.current;
    if (!el) return;
    el.scrollTo({ left: 0, behavior: "auto" });
    scheduleUpdate();
    pendingAnchorRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  useEffect(() => {
    scheduleUpdate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleItems]);

  useEffect(() => {
    if (!viewAllOpen) {
      setViewAllRenderCount(0);
      return;
    }
    setViewAllRenderCount((prev) => {
      const base = prev > 0 ? prev : 48;
      return Math.min(Math.max(24, base), visibleItems.length);
    });
  }, [filter, viewAllOpen, visibleItems.length]);

  useEffect(() => {
    if (!viewAllOpen) return;
    const root = viewAllScrollRef.current;
    const sentinel = viewAllSentinelRef.current;
    if (!root || !sentinel) return;
    if (typeof IntersectionObserver === "undefined") return;

    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;

        setViewAllRenderCount((prev) => {
          const next = Math.min(visibleItems.length, Math.max(24, prev) + 24);
          return next;
        });

        if (!isPaginated) return;
        if (loadingMore) return;
        if (initialFetched && !nextCursor) return;

        const nearEnd = viewAllRenderCount >= Math.max(0, visibleItems.length - 6);
        if (nearEnd) void fetchMore();
      },
      { root, rootMargin: "600px 0px", threshold: 0.01 }
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, [viewAllOpen, viewAllRenderCount, visibleItems.length, isPaginated, loadingMore, initialFetched, nextCursor, fetchMore]);

  useEffect(() => {
    const pending = pendingAnchorRef.current;
    const el = railRef.current;
    if (!pending || !el) return;
    const idx = visibleItems.findIndex((it) => `${it.kind}:${it.id}` === pending.key);
    pendingAnchorRef.current = null;
    if (idx < 0) return;
    // Avoid jumping the user when they're at the very start.
    if (el.scrollLeft <= 1) return;
    el.scrollLeft = idx * stridePx + pending.within;
    scheduleUpdate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleItems.length, stridePx]);

  if (!allItems || allItems.length === 0) return null;

  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div className="flex items-end gap-3">
          <HomeSectionIcon iconKey={iconKey} title={title} />
          <h2 className="font-brand text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {title}
          </h2>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  "group ml-1 inline-flex h-8 items-center justify-center transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30",
                  filter === "all"
                    ? "w-8 rounded-full border border-border/60 bg-background/60 text-muted-foreground shadow-sm backdrop-blur-sm hover:bg-muted/40 hover:text-foreground data-[state=open]:bg-muted/50 data-[state=open]:text-foreground"
                    : "rounded-full p-0 text-muted-foreground hover:text-foreground data-[state=open]:text-foreground"
                )}
                aria-label={
                  filter === "paths"
                    ? "Filter: paths"
                    : filter === "files"
                      ? "Filter: files"
                      : "Filter cards"
                }
                title={filter === "all" ? "Filter" : filter === "paths" ? "Showing paths" : "Showing files"}
              >
                {filter === "paths" ? (
                  <Badge
                    className={cn(
                      "pointer-events-none transition-colors",
                      "group-hover:bg-muted/40 group-hover:text-foreground",
                      "group-data-[state=open]:bg-muted/50 group-data-[state=open]:text-foreground"
                    )}
                  >
                    Path
                  </Badge>
                ) : filter === "files" ? (
                  <Badge
                    className={cn(
                      "pointer-events-none transition-colors",
                      "group-hover:bg-muted/40 group-hover:text-foreground",
                      "group-data-[state=open]:bg-muted/50 group-data-[state=open]:text-foreground"
                    )}
                  >
                    File
                  </Badge>
                ) : (
                  <Filter className="h-4 w-4" />
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" sideOffset={8} className="w-48">
              <DropdownMenuLabel>Show</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuRadioGroup
                value={filter}
                onValueChange={(v) => setFilter((v as HomeRailFilterValue) || "all")}
              >
                <DropdownMenuRadioItem value="all">
                  All
                  <DropdownMenuShortcut>{counts.total}</DropdownMenuShortcut>
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="paths" disabled={counts.paths === 0}>
                  Paths
                  <DropdownMenuShortcut>{counts.paths}</DropdownMenuShortcut>
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="files" disabled={counts.files === 0}>
                  Files
                  <DropdownMenuShortcut>{counts.files}</DropdownMenuShortcut>
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {hasOverflow && (
          <Dialog open={viewAllOpen} onOpenChange={setViewAllOpen}>
            <DialogTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9 rounded-full px-3 font-brand text-sm text-muted-foreground hover:text-foreground"
                aria-label={`View all ${title}`}
              >
                View all
              </Button>
            </DialogTrigger>
            <DialogContent ref={viewAllScrollRef} className="sm:max-w-6xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="font-brand text-2xl sm:text-3xl">
                  {title}
                </DialogTitle>
              </DialogHeader>
              <div className="grid gap-6 grid-cols-[repeat(auto-fill,minmax(min(100%,320px),360px))]">
                {visibleItems.slice(0, Math.max(0, viewAllRenderCount || 0)).map((item) => (
                  <div
                    key={`${item.kind}:${item.id}`}
                    style={{ contentVisibility: "auto", containIntrinsicSize: "280px" }}
                  >
                    {item.kind === "material" ? (
                      <MaterialCardLarge file={item.file} />
                    ) : (
                      <PathCardLarge path={item.path} />
                    )}
                  </div>
                ))}
                {(loadingMore || viewAllRenderCount < visibleItems.length) &&
                  Array.from({ length: 6 }).map((_, i) => (
                    <div
                      key={`viewall-skel:${i}`}
                      className="h-[280px] w-full max-w-[360px] rounded-xl border border-border/60 bg-muted/20 p-4"
                    >
                      <Skeleton className="h-36 w-full rounded-lg bg-muted/30" />
                      <div className="mt-4 space-y-2">
                        <Skeleton className="h-4 w-3/4 bg-muted/30" />
                        <Skeleton className="h-4 w-1/2 bg-muted/30" />
                      </div>
                    </div>
                  ))}
              </div>
              <div ref={viewAllSentinelRef} aria-hidden="true" className="h-px w-full" />
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="relative -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div
          ref={railRef}
          className="scrollbar-none flex gap-6 overflow-x-auto overscroll-x-contain pb-1 scroll-smooth snap-x snap-proximity"
          style={{
            WebkitOverflowScrolling: "touch",
            paddingLeft: Math.max(0, range.start) * stridePx,
            paddingRight: Math.max(0, displayCount - range.end) * stridePx,
          }}
          onWheel={(e) => {
            const el = e.currentTarget;
            const canScrollX = el.scrollWidth > el.clientWidth;
            if (!canScrollX) return;
            if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
            el.scrollLeft += e.deltaY;
          }}
          onScroll={scheduleUpdate}
        >
          {Array.from({ length: Math.max(0, range.end - range.start) }).map((_, offset) => {
            const idx = range.start + offset;
            const item = idx < visibleItems.length ? visibleItems[idx] : null;
            if (!item) {
              return (
                <div
                  key={`rail-skel:${idx}`}
                  className="shrink-0 snap-start w-[320px] sm:w-[360px]"
                  aria-hidden="true"
                >
                  <div className="h-[280px] w-full rounded-xl border border-border/60 bg-muted/20 p-4">
                    <Skeleton className="h-36 w-full rounded-lg bg-muted/30" />
                    <div className="mt-4 space-y-2">
                      <Skeleton className="h-4 w-3/4 bg-muted/30" />
                      <Skeleton className="h-4 w-1/2 bg-muted/30" />
                    </div>
                  </div>
                </div>
              );
            }
            return (
              <div
                key={`${item.kind}:${item.id}`}
                className="shrink-0 snap-start w-[320px] sm:w-[360px]"
              >
                {item.kind === "material" ? (
                  <MaterialCardLarge file={item.file} />
                ) : (
                  <PathCardLarge path={item.path} />
                )}
              </div>
            );
          })}
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
