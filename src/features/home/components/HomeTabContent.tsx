import React, { useMemo } from "react";
import { PathCardLarge } from "@/features/paths/components/PathCardLarge";
import { EmptyContent } from "@/shared/components/EmptyContent";
import type { Path } from "@/shared/types/models";

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
}

export function HomeTabContent({ activeTab, paths, loading }: HomeTabContentProps) {
  const filtered = useMemo(
    () => filterPathsByTab(paths, activeTab),
    [paths, activeTab]
  );

  if (loading) {
    return (
      <div className="w-full">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-[280px] rounded-xl border border-border bg-muted/30"
            />
          ))}
        </div>
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





