import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { m } from "framer-motion";
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
import { nbFadeUp, nbTransitions } from "@/shared/motion/presets";
import {
  ChevronLeft,
  ChevronRight,
  Filter,
} from "lucide-react";
import type { LibraryTaxonomySnapshotV1, MaterialFile, Path } from "@/shared/types/models";
import { listTaxonomyNodeItems } from "@/shared/api/LibraryService";
import { getHomeSectionIcon } from "@/features/home/lib/homeSectionIcons";
import { useI18n } from "@/app/providers/I18nProvider";
import type { MessageKey } from "@/shared/i18n/messages";
import type { TemplateValues } from "@/shared/i18n/translate";

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

function pathReadyMs(path: Path) {
  const legacy = path as Path & LegacyTimestampPath & { ready_at?: string | null };
  const ms = new Date(
    path?.readyAt ||
      legacy.ready_at ||
      path?.updatedAt ||
      legacy.updated_at ||
      path?.createdAt ||
      legacy.created_at ||
      0
  ).getTime();
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

function buildHomeItems(
  sectionPaths: Path[],
  filesByMaterialSetId: Map<string, MaterialFile[]>,
  opts: { includeMaterials?: boolean } = {}
): HomeCardItem[] {
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

type TFn = (key: MessageKey, values?: TemplateValues) => string;

function emptyCopy(activeTab: HomeTabKey, t: TFn) {
  switch (activeTab) {
    case "in-progress":
      return {
        title: t("home.empty.inProgress.title"),
        description: t("home.empty.inProgress.description"),
      };
    case "saved":
      return {
        title: t("home.empty.saved.title"),
        description: t("home.empty.saved.description"),
      };
    case "completed":
      return {
        title: t("home.empty.completed.title"),
        description: t("home.empty.completed.description"),
      };
    case "recently-viewed":
      return {
        title: t("home.empty.recent.title"),
        description: t("home.empty.recent.description"),
      };
    default:
      return {
        title: t("home.empty.default.title"),
        description: t("home.empty.default.description"),
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
  homeTopicFocus?: { nodeId: string; title: string; iconKey?: string } | null;
  onHomeTopicViewAll?: (focus: { nodeId: string; title: string; iconKey?: string }) => void;
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

function HomeSectionIcon({ iconKey }: { iconKey?: string }) {
  const Icon = getHomeSectionIcon(iconKey);
  if (!Icon) return null;

  return (
    <div
      aria-hidden="true"
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center rounded-full border border-border/60",
        // Responsive sizing: 36px mobile, 40px tablet, 44px desktop
        "h-9 w-9 sm:h-10 sm:w-10 md:h-11 md:w-11",
        "bg-gradient-to-br from-background/80 via-background/60 to-muted/30 shadow-sm backdrop-blur-sm",
        "ring-1 ring-inset ring-white/10 dark:ring-white/5",
        "shadow-[0_1px_0_rgba(255,255,255,0.10)_inset]"
      )}
    >
      {/* Responsive icon sizing */}
      <Icon className="h-4 w-4 sm:h-[18px] sm:w-[18px] md:h-5 md:w-5 text-muted-foreground" />
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
  homeTopicFocus,
  onHomeTopicViewAll,
}: HomeTabContentProps) {
  const { t } = useI18n();
  const isHome = activeTab === "home";
  const focusedNodeId = isHome ? String(homeTopicFocus?.nodeId || "").trim() : "";
  const materialList = materialFiles ?? [];
  const pathIdByMaterialSetId = useMemo(() => {
    const out = new Map<string, string>();
    const list = Array.isArray(paths) ? paths : [];
    for (const p of list) {
      const setId = String(p?.materialSetId || "").trim();
      const pathId = String(p?.id || "").trim();
      if (!setId || !pathId) continue;
      if (!out.has(setId)) out.set(setId, pathId);
    }
    return out;
  }, [paths]);

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
    const readyMsFor = (p: Path) => pathReadyMs(p);
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
        title: t("home.sections.generating"),
        iconKey: "generating",
        items: buildHomeItems(generating, filesByMaterialSetId, { includeMaterials: false }),
      });
    }
    sections.push({
      id: "new",
      title: t("home.sections.new"),
      iconKey: "new",
      items: buildHomeItems(newPaths, filesByMaterialSetId),
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
        title: node.name || t("home.untitled"),
        iconKey: String(node.key || ""),
        items: buildHomeItems(ordered, filesByMaterialSetId),
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
  }, [filesByMaterialSetId, isHome, paths, t, taxonomySnapshot]);

  const visibleHomeSections = useMemo(() => {
    return (homeSections || []).filter((s) => (s.items?.length ?? 0) > 0);
  }, [homeSections]);

  if (isHome && focusedNodeId) {
    const section =
      homeSections.find((s) => String(s?.nodeId || "") === focusedNodeId) ??
      homeSections.find((s) => String(s?.id || "") === focusedNodeId) ??
      null;
    const seedItems = section?.items ?? [];

    return (
      <HomeTopicFocusView
        focusNodeId={focusedNodeId}
        seedItems={seedItems}
        focusTitle={section?.title || homeTopicFocus?.title || t("home.topicFallback")}
        focusIconKey={section?.iconKey || homeTopicFocus?.iconKey}
        taxonomySnapshot={taxonomySnapshot ?? null}
        paths={paths}
        filesByMaterialSetId={filesByMaterialSetId}
        pathIdByMaterialSetId={pathIdByMaterialSetId}
      />
    );
  }

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
      const copy = emptyCopy(activeTab, t);
      return (
        <div className="w-full">
          <EmptyContent title={copy.title} message={copy.description} helperText="" />
        </div>
      );
    }

    if (visibleHomeSections.length === 0) {
      // Fallback: never render an empty home view (e.g., missing taxonomy snapshot, legacy timestamps).
      const recent = filterPathsByTab(paths, "home").slice(0, 24);
      if (recent.length > 0) {
        return (
          <div className="w-full">
            {/* Responsive grid: 1 col on mobile, 2 on tablet, 3+ on desktop */}
            <div className="grid gap-4 xs:gap-5 sm:gap-6 grid-cols-1 xs:grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(min(100%,280px),340px))] lg:grid-cols-[repeat(auto-fill,minmax(min(100%,320px),380px))]">
              {recent.map((path) => (
                <PathCardLarge key={path.id} path={path} />
              ))}
            </div>
          </div>
        );
      }

      const orderedFiles = (materialList || []).slice().sort((a, b) => materialUpdatedMs(b) - materialUpdatedMs(a));
      if (orderedFiles.length > 0) {
        return (
          <div className="w-full">
            {/* Responsive grid: 1 col on mobile, 2 on tablet, 3+ on desktop */}
            <div className="grid gap-4 xs:gap-5 sm:gap-6 grid-cols-1 xs:grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(min(100%,280px),340px))] lg:grid-cols-[repeat(auto-fill,minmax(min(100%,320px),380px))]">
              {orderedFiles.slice(0, 24).map((file) => (
                <MaterialCardLarge key={file.id} file={file} />
              ))}
            </div>
          </div>
        );
      }

      const copy = emptyCopy(activeTab, t);
      return (
        <div className="w-full">
          <EmptyContent title={copy.title} message={copy.description} helperText="" />
        </div>
      );
    }

    return (
      <div className="w-full space-y-12">
        {visibleHomeSections.map((section) => (
          <HomeRail
            key={section.id}
            title={section.title}
            iconKey={section.iconKey}
            items={section.items}
            nodeId={section.nodeId}
            onViewAll={
              section.nodeId && onHomeTopicViewAll
                ? () => onHomeTopicViewAll({ nodeId: section.nodeId || "", title: section.title, iconKey: section.iconKey })
                : undefined
            }
          />
        ))}
      </div>
    );
  }

  if (!filtered || filtered.length === 0) {
    const copy = emptyCopy(activeTab, t);
    return (
      <div className="w-full">
        <EmptyContent title={copy.title} message={copy.description} helperText="" />
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Responsive grid for filtered view */}
      <div className="grid gap-4 xs:gap-5 sm:gap-6 grid-cols-1 xs:grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(min(100%,280px),340px))] lg:grid-cols-[repeat(auto-fill,minmax(min(100%,320px),380px))]">
        {filtered.map((path) => (
          <PathCardLarge key={path.id} path={path} />
        ))}
      </div>
    </div>
  );
}

function HomeTopicFocusView({
  focusNodeId,
  seedItems,
  focusTitle,
  focusIconKey,
  taxonomySnapshot,
  paths,
  filesByMaterialSetId,
  pathIdByMaterialSetId,
}: {
  focusNodeId: string;
  seedItems: HomeCardItem[];
  focusTitle: string;
  focusIconKey?: string;
  taxonomySnapshot: LibraryTaxonomySnapshotV1 | null;
  paths: Path[];
  filesByMaterialSetId: Map<string, MaterialFile[]>;
  pathIdByMaterialSetId: Map<string, string>;
}) {
  const { t } = useI18n();
  const topicFacet = taxonomySnapshot?.facets?.topic ?? null;
  const nodes = topicFacet?.nodes ?? [];
  const edges = topicFacet?.edges ?? [];
  const memberships = topicFacet?.memberships ?? [];

  const nodesById = useMemo(() => {
    const out = new Map<string, (typeof nodes)[number]>();
    for (const n of nodes) {
      const id = String(n?.id || "").trim();
      if (!id) continue;
      out.set(id, n);
    }
    return out;
  }, [nodes]);

  const membershipByNodeId = useMemo(() => {
    const out = new Map<string, { path_id: string; weight: number }[]>();
    for (const m of memberships) {
      const id = String(m?.node_id || "").trim();
      if (!id) continue;
      const rows = Array.isArray(m?.paths) ? m.paths : [];
      out.set(
        id,
        rows
          .map((r) => ({
            path_id: String(r?.path_id || "").trim(),
            weight: typeof r?.weight === "number" ? r.weight : Number(r?.weight || 0),
          }))
          .filter((r) => Boolean(r.path_id))
      );
    }
    return out;
  }, [memberships]);

  const childNodes = useMemo(() => {
    const out = new Map<string, (typeof nodes)[number]>();
    for (const e of edges) {
      if (String(e?.kind || "").toLowerCase() !== "subsumes") continue;
      if (String(e?.from_node_id || "").trim() !== focusNodeId) continue;
      const toId = String(e?.to_node_id || "").trim();
      if (!toId) continue;
      const node = nodesById.get(toId);
      if (!node) continue;
      if (String(node?.kind || "").toLowerCase() !== "category") continue;
      out.set(toId, node);
    }
    const list = Array.from(out.values());
    list.sort((a, b) => {
      const diff = (Number(b?.member_count || 0) || 0) - (Number(a?.member_count || 0) || 0);
      if (diff !== 0) return diff;
      return String(a?.name || "").localeCompare(String(b?.name || ""), undefined, { sensitivity: "base" });
    });
    return list;
  }, [edges, focusNodeId, nodesById]);

  const focusPathIdSet = useMemo(() => {
    const rows = membershipByNodeId.get(focusNodeId) ?? [];
    const out = new Set<string>();
    for (const r of rows) {
      const pid = String(r?.path_id || "").trim();
      if (pid) out.add(pid);
    }
    return out;
  }, [focusNodeId, membershipByNodeId]);

  const focusPaths = useMemo(() => {
    const list = Array.isArray(paths) ? paths : [];
    return list.filter((p) => {
      const id = String(p?.id || "").trim();
      if (!id) return false;
      if (isBuildingPath(p)) return false;
      return focusPathIdSet.has(id);
    });
  }, [focusPathIdSet, paths]);

  const primaryChildByPathId = useMemo(() => {
    const out = new Map<string, { nodeId: string; weight: number }>();
    for (const child of childNodes) {
      const nid = String(child?.id || "").trim();
      if (!nid) continue;
      const rows = membershipByNodeId.get(nid) ?? [];
      for (const r of rows) {
        const pid = String(r?.path_id || "").trim();
        if (!pid) continue;
        const weight = typeof r?.weight === "number" ? r.weight : Number(r?.weight || 0);
        const prev = out.get(pid);
        if (!prev || weight > prev.weight) out.set(pid, { nodeId: nid, weight });
      }
    }
    return out;
  }, [childNodes, membershipByNodeId]);

  const focusView = useMemo(() => {
    const childIdSet = new Set(childNodes.map((n) => String(n?.id || "").trim()).filter(Boolean));
    const pathsByChildId = new Map<string, Path[]>();
    const otherPaths: Path[] = [];

    for (const p of focusPaths) {
      const pid = String(p?.id || "").trim();
      if (!pid) continue;
      const primary = primaryChildByPathId.get(pid)?.nodeId ?? null;
      if (primary && childIdSet.has(primary)) {
        const arr = pathsByChildId.get(primary) ?? [];
        arr.push(p);
        pathsByChildId.set(primary, arr);
      } else {
        otherPaths.push(p);
      }
    }

    const primaryForPathId = (pathId: string) => primaryChildByPathId.get(pathId)?.nodeId ?? null;

    const allowForChild = (childId: string) => {
      return (item: HomeCardItem) => {
        if (item.kind === "path") {
          const pid = String(item.id || "").trim();
          if (!pid) return true;
          const primary = primaryForPathId(pid);
          if (!primary) return true;
          return primary === childId;
        }
        const setId = String(item.file?.materialSetId || "").trim();
        if (!setId) return true;
        const pid = pathIdByMaterialSetId.get(setId);
        if (!pid) return true;
        const primary = primaryForPathId(pid);
        if (!primary) return true;
        return primary === childId;
      };
    };

    const allowForOther = () => {
      return (item: HomeCardItem) => {
        if (item.kind === "path") return !primaryForPathId(String(item.id || "").trim());
        const setId = String(item.file?.materialSetId || "").trim();
        if (!setId) return true;
        const pid = pathIdByMaterialSetId.get(setId);
        if (!pid) return true;
        return !primaryForPathId(pid);
      };
    };

    const out: Array<{
      id: string;
      title: string;
      iconKey?: string;
      items: HomeCardItem[];
      nodeId?: string;
      allowItem?: (item: HomeCardItem) => boolean;
    }> = [];

    const subtopicSections = childNodes
      .map((child) => {
        const nid = String(child?.id || "").trim();
        if (!nid) return null;
        const assigned = (pathsByChildId.get(nid) ?? []).slice().sort(byUpdatedDesc);
        if (assigned.length === 0) return null;
        return {
          id: nid,
          title: String(child?.name || t("home.untitled")),
          iconKey: String(child?.key || "") || undefined,
          items: buildHomeItems(assigned, filesByMaterialSetId),
          nodeId: nid,
          allowItem: allowForChild(nid),
        };
      })
      .filter(Boolean) as Array<{
      id: string;
      title: string;
      iconKey?: string;
      items: HomeCardItem[];
      nodeId?: string;
      allowItem?: (item: HomeCardItem) => boolean;
      }>;

    if (subtopicSections.length === 0) {
      const ordered = focusPaths.slice().sort(byUpdatedDesc);
      const allItems = ordered.length > 0 ? buildHomeItems(ordered, filesByMaterialSetId) : seedItems;
      return { kind: "all" as const, items: allItems };
    }

    // Subtopics exist: show child sections, plus a catch-all for anchor-only items (if any).
    out.push(...subtopicSections);

    const otherOrdered = otherPaths.slice().sort(byUpdatedDesc);
    if (otherOrdered.length > 0) {
      out.push({
        id: `other:${focusNodeId}`,
        title: t("home.sections.other"),
        items: buildHomeItems(otherOrdered, filesByMaterialSetId),
        nodeId: focusNodeId,
        allowItem: allowForOther(),
      });
    }

    return { kind: "rails" as const, sections: out };
  }, [
    childNodes,
    filesByMaterialSetId,
    focusIconKey,
    focusNodeId,
    focusPaths,
    pathIdByMaterialSetId,
    primaryChildByPathId,
    seedItems,
    t,
  ]);

  if (focusView.kind === "all") {
    if ((focusView.items?.length ?? 0) === 0) {
      const emptyTitle = focusTitle
        ? t("home.focus.emptyTitle.within", { title: focusTitle })
        : t("home.focus.emptyTitle.generic");
      return (
        <div className="w-full">
          <EmptyContent
            title={emptyTitle}
            message={t("home.focus.emptyMessage")}
            helperText=""
          />
        </div>
      );
    }

    return (
      <div className="w-full">
        <HomeTopicAllGrid nodeId={focusNodeId} seedItems={focusView.items} />
      </div>
    );
  }

  const sections = focusView.sections;
  const emptyTitle = focusTitle
    ? t("home.focus.emptyTitle.within", { title: focusTitle })
    : t("home.focus.emptyTitle.generic");
  const hasAny = sections.some((s) => (s.items?.length ?? 0) > 0);

  if (!hasAny) {
    return (
      <div className="w-full">
        <EmptyContent title={emptyTitle} message={t("home.focus.emptyMessage")} helperText="" />
      </div>
    );
  }

  return (
    <div className="w-full space-y-12">
      {sections.map((section) => (
        <HomeRail
          key={section.id}
          title={section.title}
          iconKey={section.iconKey}
          items={section.items}
          nodeId={section.nodeId}
          allowItem={section.allowItem}
        />
      ))}
    </div>
  );
}

function HomeTopicAllGrid({ nodeId, seedItems }: { nodeId: string; seedItems: HomeCardItem[] }) {
  const [loadedItems, setLoadedItems] = useState<HomeCardItem[]>(() => seedItems || []);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [initialFetched, setInitialFetched] = useState(false);
  const sessionRef = useRef(0);
  const loadingMoreRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

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

  const fetchMore = useCallback(async () => {
    const nid = String(nodeId || "").trim();
    if (!nid) return;
    if (loadingMoreRef.current) return;
    if (initialFetched && !nextCursor) return;

    const session = sessionRef.current;
    loadingMoreRef.current = true;
    setLoadingMore(true);

    try {
      const { items: incoming, nextCursor: cursor } = await listTaxonomyNodeItems(nid, {
        facet: "topic",
        filter: "all",
        limit: 60,
        cursor: initialFetched ? nextCursor : null,
      });
      if (session !== sessionRef.current) return;
      const mapped: HomeCardItem[] = incoming.map((it) => {
        if (it.kind === "path") return { kind: "path", id: String(it.path.id), path: it.path };
        return { kind: "material", id: String(it.file.id), file: it.file };
      });
      setLoadedItems((prev) => mergeIntoLoaded(prev, mapped));
      setNextCursor(cursor);
      setInitialFetched(true);
    } catch (err) {
      if (session !== sessionRef.current) return;
      console.warn("[HomeTopicAllGrid] Failed to load items:", err);
      setInitialFetched(true);
      setNextCursor(null);
    } finally {
      if (session === sessionRef.current) {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
    }
  }, [initialFetched, mergeIntoLoaded, nextCursor, nodeId]);

  useEffect(() => {
    sessionRef.current += 1;
    setLoadedItems(seedItems || []);
    setNextCursor(null);
    setInitialFetched(false);
    loadingMoreRef.current = false;
    setLoadingMore(false);
    return () => {
      sessionRef.current += 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId]);

  useEffect(() => {
    if (!seedItems || seedItems.length === 0) return;
    setLoadedItems((prev) => mergeIntoLoaded(prev, seedItems));
  }, [mergeIntoLoaded, seedItems]);

  useEffect(() => {
    if (!nodeId) return;
    if (loadingMoreRef.current) return;
    if (initialFetched) return;
    void fetchMore();
  }, [fetchMore, initialFetched, nodeId]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    if (typeof IntersectionObserver === "undefined") return;

    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        void fetchMore();
      },
      { root: null, rootMargin: "900px 0px", threshold: 0.01 }
    );

    io.observe(sentinel);
    return () => io.disconnect();
  }, [fetchMore]);

  const showSkeletons = loadingMore || (!initialFetched && loadedItems.length === 0);

  return (
    <div className="w-full">
      {/* Responsive grid for topic focus view */}
      <div className="grid gap-4 xs:gap-5 sm:gap-6 grid-cols-1 xs:grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(min(100%,280px),340px))] lg:grid-cols-[repeat(auto-fill,minmax(min(100%,320px),380px))]">
        {loadedItems.map((item) => (
          <m.div
            key={`${item.kind}:${item.id}`}
            initial="initial"
            animate="animate"
            variants={nbFadeUp}
            transition={nbTransitions.micro}
            style={{ contentVisibility: "auto", containIntrinsicSize: "280px" }}
          >
            {item.kind === "material" ? <MaterialCardLarge file={item.file} /> : <PathCardLarge path={item.path} />}
          </m.div>
        ))}

        {showSkeletons
          ? Array.from({ length: 9 }).map((_, i) => (
              <div
                key={`topic-grid-skel:${i}`}
                className="h-[260px] xs:h-[270px] sm:h-[280px] w-full rounded-xl border border-border/60 bg-muted/20 p-4"
              >
                <Skeleton className="h-32 xs:h-34 sm:h-36 w-full rounded-lg bg-muted/30" />
                <div className="mt-4 space-y-2">
                  <Skeleton className="h-4 w-3/4 bg-muted/30" />
                  <Skeleton className="h-4 w-1/2 bg-muted/30" />
                </div>
              </div>
            ))
          : null}
      </div>
      <div ref={sentinelRef} aria-hidden="true" className="h-px w-full" />
    </div>
  );
}

function HomeRail({
  title,
  iconKey,
  items,
  nodeId,
  onViewAll,
  allowItem,
}: {
  title: string;
  iconKey?: string;
  items: HomeCardItem[];
  nodeId?: string;
  onViewAll?: () => void;
  allowItem?: (item: HomeCardItem) => boolean;
}) {
  const { t } = useI18n();
  const railRef = useRef<HTMLDivElement | null>(null);
  const pendingAnchorRef = useRef<{ key: string; within: number } | null>(null);
  const [filter, setFilter] = useState<HomeRailFilterValue>("all");
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);
  const [hasOverflow, setHasOverflow] = useState(false);

  const isPaginated = Boolean(nodeId);
  const [loadedItems, setLoadedItems] = useState<HomeCardItem[]>(() => {
    const base = items || [];
    return allowItem ? base.filter(allowItem) : base;
  });
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
    const incoming = allowItem ? (items || []).filter(allowItem) : (items || []);
    setLoadedItems((prev) => mergeIntoLoaded(prev, incoming));
  }, [allowItem, isPaginated, items, mergeIntoLoaded]);

  useEffect(() => {
    if (!isPaginated) return;
    // When node changes, reset pagination state.
    const incoming = allowItem ? (items || []).filter(allowItem) : (items || []);
    setLoadedItems(incoming);
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
      const accepted = allowItem ? mapped.filter(allowItem) : mapped;
      setLoadedItems((prev) => mergeIntoLoaded(prev, accepted));
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
  }, [allowItem, initialFetched, mergeIntoLoaded, nextCursor, nodeId, stridePx, visibleItems]);

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
	    setCanScrollPrev(el.scrollLeft > 4);
	    setCanScrollNext(el.scrollLeft < maxScrollLeft - 4);
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
    <section className="space-y-3 sm:space-y-4 md:space-y-5">
      {/* Section header - responsive layout */}
      <div className="flex items-center sm:items-end justify-between gap-3 sm:gap-4">
        <div className="flex items-center sm:items-end gap-2.5 sm:gap-3 min-w-0">
          <HomeSectionIcon iconKey={iconKey} />
          {/* Responsive title: truncate on mobile, full on desktop */}
          <h2 className={cn(
            "font-brand font-bold tracking-tight text-foreground",
            // Responsive typography
            "text-lg xs:text-xl sm:text-2xl md:text-[28px] lg:text-3xl",
            // Truncate on very small screens
            "truncate sm:text-clip"
          )}>
            {title}
          </h2>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  "group ms-1 inline-flex items-center justify-center transition-colors",
                  // Touch-friendly sizing (44px on mobile, 32px on desktop)
                  "h-11 sm:h-8",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30",
                  // Touch optimizations
                  "touch-manipulation -webkit-tap-highlight-color-transparent",
                  "active:scale-95",
                  filter === "all"
                    ? "w-11 sm:w-8 rounded-full border border-border/60 bg-background/60 text-muted-foreground shadow-sm backdrop-blur-sm hover:bg-muted/40 hover:text-foreground data-[state=open]:bg-muted/50 data-[state=open]:text-foreground"
                    : "rounded-full p-0 text-muted-foreground hover:text-foreground data-[state=open]:text-foreground"
                )}
                aria-label={
                  filter === "paths"
                    ? t("home.filter.aria.paths")
                    : filter === "files"
                      ? t("home.filter.aria.files")
                      : t("home.filter.aria.cards")
                }
                title={
                  filter === "all"
                    ? t("home.filter.title.filter")
                    : filter === "paths"
                      ? t("home.filter.title.showingPaths")
                      : t("home.filter.title.showingFiles")
                }
              >
                {filter === "paths" ? (
                  <Badge
                    className={cn(
                      "pointer-events-none transition-colors",
                      "group-hover:bg-muted/40 group-hover:text-foreground",
                      "group-data-[state=open]:bg-muted/50 group-data-[state=open]:text-foreground"
                    )}
                  >
                    {t("home.filter.badge.path")}
                  </Badge>
                ) : filter === "files" ? (
                  <Badge
                    className={cn(
                      "pointer-events-none transition-colors",
                      "group-hover:bg-muted/40 group-hover:text-foreground",
                      "group-data-[state=open]:bg-muted/50 group-data-[state=open]:text-foreground"
                    )}
                  >
                    {t("home.filter.badge.file")}
                  </Badge>
                ) : (
                  <Filter className="h-4 w-4" />
                )}
              </button>
            </DropdownMenuTrigger>
	            <DropdownMenuContent align="start" sideOffset={8} className="w-48">
	              <DropdownMenuLabel>{t("home.filter.label.show")}</DropdownMenuLabel>
	              <DropdownMenuSeparator />
	              <DropdownMenuRadioGroup
	                value={filter}
	                onValueChange={(v) => setFilter((v as HomeRailFilterValue) || "all")}
	              >
	                <DropdownMenuRadioItem value="all">
	                  {t("common.all")}
	                  <DropdownMenuShortcut>{counts.total}</DropdownMenuShortcut>
	                </DropdownMenuRadioItem>
	                <DropdownMenuRadioItem value="paths" disabled={counts.paths === 0}>
	                  {t("nav.paths")}
	                  <DropdownMenuShortcut>{counts.paths}</DropdownMenuShortcut>
	                </DropdownMenuRadioItem>
	                <DropdownMenuRadioItem value="files" disabled={counts.files === 0}>
	                  {t("nav.files")}
	                  <DropdownMenuShortcut>{counts.files}</DropdownMenuShortcut>
	                </DropdownMenuRadioItem>
	              </DropdownMenuRadioGroup>
	            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {hasOverflow ? (
          onViewAll ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={cn(
                "rounded-full font-brand text-muted-foreground hover:text-foreground",
                // Responsive sizing: touch-friendly on mobile
                "h-10 sm:h-9 px-3 sm:px-3",
                "text-sm sm:text-sm",
                // Touch optimizations
                "touch-manipulation -webkit-tap-highlight-color-transparent",
                "active:scale-[0.97]",
                // Shrink to fit on small screens
                "flex-shrink-0"
              )}
              onClick={onViewAll}
              aria-label={t("home.viewAll.aria", { title })}
            >
              {t("home.viewAll")}
            </Button>
          ) : (
            <Dialog open={viewAllOpen} onOpenChange={setViewAllOpen}>
              <DialogTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "rounded-full font-brand text-muted-foreground hover:text-foreground",
                    // Responsive sizing: touch-friendly on mobile
                    "h-10 sm:h-9 px-3 sm:px-3",
                    "text-sm sm:text-sm",
                    // Touch optimizations
                    "touch-manipulation -webkit-tap-highlight-color-transparent",
                    "active:scale-[0.97]",
                    // Shrink to fit on small screens
                    "flex-shrink-0"
                  )}
                  aria-label={t("home.viewAll.aria", { title })}
                >
                  {t("home.viewAll")}
                </Button>
              </DialogTrigger>
              <DialogContent ref={viewAllScrollRef} className="w-[95vw] max-w-6xl max-h-[90vh] sm:max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="font-brand text-xl xs:text-2xl sm:text-3xl">
                    {title}
                  </DialogTitle>
                </DialogHeader>
                {/* Responsive grid inside dialog */}
                <div className="grid gap-4 xs:gap-5 sm:gap-6 grid-cols-1 xs:grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(min(100%,280px),340px))] lg:grid-cols-[repeat(auto-fill,minmax(min(100%,320px),380px))]">
                  {visibleItems.slice(0, Math.max(0, viewAllRenderCount || 0)).map((item) => (
                    <m.div
                      key={`${item.kind}:${item.id}`}
                      initial="initial"
                      animate="animate"
                      variants={nbFadeUp}
                      transition={nbTransitions.micro}
                      style={{ contentVisibility: "auto", containIntrinsicSize: "280px" }}
                    >
                      {item.kind === "material" ? (
                        <MaterialCardLarge file={item.file} />
                      ) : (
                        <PathCardLarge path={item.path} />
                      )}
                    </m.div>
                  ))}
                  {(loadingMore || viewAllRenderCount < visibleItems.length) &&
                    Array.from({ length: 6 }).map((_, i) => (
                      <div
                        key={`viewall-skel:${i}`}
                        className="h-[260px] xs:h-[270px] sm:h-[280px] w-full rounded-xl border border-border/60 bg-muted/20 p-4"
                      >
                        <Skeleton className="h-32 xs:h-34 sm:h-36 w-full rounded-lg bg-muted/30" />
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
          )
        ) : null}
      </div>

      {/* Rail container - full-bleed on mobile, contained on desktop */}
      <div className="relative -mx-4 px-4 xs:-mx-5 xs:px-5 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div
          ref={railRef}
          className={cn(
            "scrollbar-none flex overflow-x-auto overscroll-x-contain pb-2 scroll-smooth",
            // Snap behavior: mandatory on mobile for that native carousel feel
            "snap-x snap-mandatory sm:snap-proximity",
            // Responsive gaps: tighter on mobile, spacious on desktop
            "gap-3 xs:gap-4 sm:gap-5 md:gap-6",
            // Touch optimizations
            "touch-pan-x -webkit-tap-highlight-color-transparent",
            // Smooth momentum scrolling
            "-webkit-overflow-scrolling-touch"
          )}
          style={{
            WebkitOverflowScrolling: "touch",
            paddingInlineStart: Math.max(0, range.start) * stridePx,
            paddingInlineEnd: Math.max(0, displayCount - range.end) * stridePx,
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
                  className={cn(
                    "shrink-0 snap-center sm:snap-start",
                    // Responsive card widths: nearly full on mobile, fixed on desktop
                    "w-[280px] xs:w-[300px] sm:w-[320px] md:w-[340px] lg:w-[360px]"
                  )}
                  aria-hidden="true"
                >
                  <div className="h-[260px] xs:h-[270px] sm:h-[280px] w-full rounded-xl border border-border/60 bg-muted/20 p-4">
                    <Skeleton className="h-32 xs:h-34 sm:h-36 w-full rounded-lg bg-muted/30" />
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
                className={cn(
                  "shrink-0 snap-center sm:snap-start",
                  // Responsive card widths: nearly full on mobile, fixed on desktop
                  "w-[280px] xs:w-[300px] sm:w-[320px] md:w-[340px] lg:w-[360px]"
                )}
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

        {/* Gradient fade indicators - responsive width */}
        <div
          className={cn(
            "pointer-events-none absolute inset-y-0 left-0 bg-gradient-to-r from-background to-transparent transition-opacity",
            "w-8 xs:w-10 sm:w-12 md:w-16",
            canScrollPrev ? "opacity-100" : "opacity-0"
          )}
        />
        <div
          className={cn(
            "pointer-events-none absolute inset-y-0 right-0 bg-gradient-to-l from-background to-transparent transition-opacity",
            "w-8 xs:w-10 sm:w-12 md:w-16",
            canScrollNext ? "opacity-100" : "opacity-0"
          )}
        />

        {/* Scroll buttons - hidden on mobile (native touch scroll), visible on sm+ */}
        {canScrollPrev && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(
              "absolute top-1/2 -translate-y-1/2 rounded-full border border-border bg-background/90 shadow-md backdrop-blur-sm",
              // Hidden on mobile (use native swipe), visible on tablet+
              "hidden sm:flex",
              // Responsive positioning
              "left-0 sm:left-1 md:left-2",
              // Responsive sizing: 40px tablet, 44px desktop
              "h-10 w-10 md:h-11 md:w-11",
              // Touch optimizations
              "touch-manipulation -webkit-tap-highlight-color-transparent",
              "hover:bg-background hover:border-border/80 hover:shadow-lg",
              "active:scale-95 active:bg-background/80"
            )}
            aria-label={t("home.scroll.prev", { title })}
            onClick={() => scrollByCards(-1)}
          >
            <ChevronLeft className="h-5 w-5 md:h-6 md:w-6" />
          </Button>
        )}

        {canScrollNext && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(
              "absolute top-1/2 -translate-y-1/2 rounded-full border border-border bg-background/90 shadow-md backdrop-blur-sm",
              // Hidden on mobile (use native swipe), visible on tablet+
              "hidden sm:flex",
              // Responsive positioning
              "right-0 sm:right-1 md:right-2",
              // Responsive sizing: 40px tablet, 44px desktop
              "h-10 w-10 md:h-11 md:w-11",
              // Touch optimizations
              "touch-manipulation -webkit-tap-highlight-color-transparent",
              "hover:bg-background hover:border-border/80 hover:shadow-lg",
              "active:scale-95 active:bg-background/80"
            )}
            aria-label={t("home.scroll.next", { title })}
            onClick={() => scrollByCards(1)}
          >
            <ChevronRight className="h-5 w-5 md:h-6 md:w-6" />
          </Button>
        )}
      </div>
    </section>
  );
}
