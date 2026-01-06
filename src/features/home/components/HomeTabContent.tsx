import React, { useEffect, useMemo, useRef, useState } from "react";
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
      .sort(byUpdatedDesc)
      .slice(0, 12);
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
      .sort((a, b) => readyMsFor(b) - readyMsFor(a))
      .slice(0, 12);

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

function HomeRail({ title, iconKey, items }: { title: string; iconKey?: string; items: HomeCardItem[] }) {
  const railRef = useRef<HTMLDivElement | null>(null);
  const [filter, setFilter] = useState<HomeRailFilterValue>("all");
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [hasOverflow, setHasOverflow] = useState(false);

  const counts = useMemo(() => {
    let paths = 0;
    let files = 0;
    for (const item of items || []) {
      if (item.kind === "path") paths++;
      if (item.kind === "material") files++;
    }
    return { paths, files, total: paths + files };
  }, [items]);

  const visibleItems = useMemo(() => {
    const list = items || [];
    if (filter === "paths") return list.filter((i) => i.kind === "path");
    if (filter === "files") return list.filter((i) => i.kind === "material");
    return list;
  }, [filter, items]);

  const updateScrollState = () => {
    const el = railRef.current;
    if (!el) return;
    const maxScrollLeft = el.scrollWidth - el.clientWidth;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft < maxScrollLeft - 4);
    setHasOverflow(maxScrollLeft > 4);
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

  useEffect(() => {
    const el = railRef.current;
    if (!el) return;
    el.scrollTo({ left: 0, behavior: "auto" });
    updateScrollState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  useEffect(() => {
    updateScrollState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleItems]);

  if (!items || items.length === 0) return null;

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
          <Dialog>
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
            <DialogContent className="sm:max-w-6xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="font-brand text-2xl sm:text-3xl">
                  {title}
                </DialogTitle>
              </DialogHeader>
              <div className="grid gap-6 grid-cols-[repeat(auto-fill,minmax(min(100%,320px),360px))]">
                {visibleItems.map((item) =>
                  item.kind === "material" ? (
                    <MaterialCardLarge key={`material:${item.id}`} file={item.file} />
                  ) : (
                    <PathCardLarge key={`path:${item.id}`} path={item.path} />
                  )
                )}
              </div>
            </DialogContent>
          </Dialog>
        )}
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
          {visibleItems.map((item) => (
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
