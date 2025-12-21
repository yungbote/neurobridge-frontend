import React, { useMemo } from "react";
import { PathCardLarge } from "@/components/app/PathCardLarge";
import { EmptyContent } from "@/components/app/EmptyContent";

function byUpdatedDesc(a, b) {
  const ad = new Date(
    a.updatedAt || a.updated_at || a.createdAt || a.created_at || 0
  ).getTime();
  const bd = new Date(
    b.updatedAt || b.updated_at || b.createdAt || b.created_at || 0
  ).getTime();
  return bd - ad;
}

function getPathStatus(path) {
  const s =
    path?.status ??
    path?.metadata?.status ??
    path?.metadata?.Status ??
    path?.metadata?.state ??
    null;
  return typeof s === "string" ? s.toLowerCase() : null;
}

function isBuildingPath(path) {
  // Placeholder + job overlay always counts as in-progress.
  if (path?.jobId || path?.jobStatus || path?.jobStage) return true;
  const status = getPathStatus(path);
  return status !== "ready";
}

function filterPathsByTab(paths, activeTab) {
  const list = Array.isArray(paths) ? paths : [];

  switch (activeTab) {
    case "in-progress":
      return list.filter((c) => {
        return isBuildingPath(c);
      });

    case "completed":
      return list.filter((p) => getPathStatus(p) === "ready" && !isBuildingPath(p));

    case "saved":
      return list.filter((c) => c?.metadata?.saved === true);

    case "recently-viewed":
      return list.slice().sort(byUpdatedDesc).slice(0, 12);

    case "home":
    default:
      return list.slice().sort(byUpdatedDesc);
  }
}

function emptyCopy(activeTab) {
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

export function HomeTabContent({ activeTab, paths, loading }) {
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







