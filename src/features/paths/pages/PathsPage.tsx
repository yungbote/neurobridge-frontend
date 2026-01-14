import React, { useMemo } from "react";
import { FolderOpen } from "lucide-react";
import { AnimatePresence, m } from "framer-motion";

import { usePaths } from "@/app/providers/PathProvider";
import { PathCardLarge, PathCardLargeSkeleton } from "@/features/paths/components/PathCardLarge";
import { EmptyContent } from "@/shared/components/EmptyContent";
import { Container } from "@/shared/layout/Container";
import { nbFadeUp, nbTransitions } from "@/shared/motion/presets";
import type { Path } from "@/shared/types/models";
import { useI18n } from "@/app/providers/I18nProvider";
import { Skeleton, SkeletonText } from "@/shared/ui/skeleton";

type LegacyTimestampPath = { updated_at?: string | null; created_at?: string | null };

function byUpdatedDesc(a: Path, b: Path) {
  const aLegacy = a as Path & LegacyTimestampPath;
  const bLegacy = b as Path & LegacyTimestampPath;
  const ad = new Date(a.updatedAt || aLegacy.updated_at || a.createdAt || aLegacy.created_at || 0).getTime();
  const bd = new Date(b.updatedAt || bLegacy.updated_at || b.createdAt || bLegacy.created_at || 0).getTime();
  return bd - ad;
}

function bySortThenUpdatedDesc(a: Path, b: Path) {
  const ai = typeof a?.sortIndex === "number" ? a.sortIndex : 0;
  const bi = typeof b?.sortIndex === "number" ? b.sortIndex : 0;
  if (ai !== bi) return ai - bi;
  return byUpdatedDesc(a, b);
}

export function PathsPageSkeleton({ embedded = false }: { embedded?: boolean } = {}) {
  const body = (
    <>
      <div className="mb-10 space-y-3">
        <Skeleton className="h-10 w-56 rounded-full" />
        <SkeletonText lines={2} className="max-w-lg" />
      </div>

      <div className="grid gap-4 sm:gap-6 grid-cols-1 xs:grid-cols-[repeat(auto-fill,minmax(min(100%,280px),360px))] sm:grid-cols-[repeat(auto-fill,minmax(min(100%,320px),360px))]">
        {Array.from({ length: 6 }).map((_, i) => (
          // eslint-disable-next-line react/no-array-index-key
          <PathCardLargeSkeleton key={i} />
        ))}
      </div>
    </>
  );

  if (embedded) {
    return <div aria-busy="true">{body}</div>;
  }

  return (
    <div className="page-surface" aria-busy="true">
      <Container size="app" className="page-pad">
        {body}
      </Container>
    </div>
  );
}

export default function PathsPage() {
  const { paths, loading } = usePaths();
  const { t } = useI18n();

  const { roots, childrenByParent } = useMemo(() => {
    const rows = Array.isArray(paths) ? paths.slice() : [];
    const clean = rows.filter((p) => !String(p?.id || "").startsWith("job:"));

    const byId = new Map<string, Path>();
    for (const p of clean) {
      if (p?.id) byId.set(String(p.id), p);
    }

    const roots: Path[] = [];
    const childrenByParent = new Map<string, Path[]>();

    for (const p of clean) {
      const id = String(p?.id || "");
      if (!id) continue;
      const parentId = String(p?.parentPathId || "");
      if (parentId && parentId !== id && byId.has(parentId)) {
        const existing = childrenByParent.get(parentId) ?? [];
        existing.push(p);
        childrenByParent.set(parentId, existing);
      } else {
        roots.push(p);
      }
    }

    roots.sort(byUpdatedDesc);
    for (const [pid, kids] of childrenByParent.entries()) {
      kids.sort(bySortThenUpdatedDesc);
      childrenByParent.set(pid, kids);
    }

    return { roots, childrenByParent };
  }, [paths]);

  if (loading && roots.length === 0) {
    return <PathsPageSkeleton />;
  }

  const renderTree = (parentId: string, visited: Set<string>) => {
    const children = childrenByParent.get(parentId) ?? [];
    if (children.length === 0) return null;

    return (
      <div
        className={[
          "mt-4 space-y-4",
          "border-l border-border/60 pl-4",
        ].filter(Boolean).join(" ")}
      >
        <div className="grid gap-4 sm:gap-6 grid-cols-1 xs:grid-cols-[repeat(auto-fill,minmax(min(100%,280px),360px))] sm:grid-cols-[repeat(auto-fill,minmax(min(100%,320px),360px))]">
          {children.map((p) => {
            const pid = String(p?.id || "");
            const nextVisited = new Set(visited);
            const already = pid ? visited.has(pid) : true;
            if (pid) nextVisited.add(pid);
            return (
              <div key={p.id} className="space-y-4">
                <PathCardLarge path={p} />
                {!already && pid ? renderTree(pid, nextVisited) : null}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="page-surface">
      <Container size="app" className="page-pad">
        <div className="mb-10 space-y-3">
          <h1 className="text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            {t("sidebar.yourPaths")}
          </h1>
          <p className="text-pretty text-sm text-muted-foreground sm:text-base">
            {t("paths.subtitle")}
          </p>
        </div>

        {roots.length === 0 ? (
          <EmptyContent
            title={t("sidebar.emptyPaths")}
            message={t("home.empty.default.description")}
            icon={<FolderOpen className="h-7 w-7" />}
          />
        ) : (
          <div className="space-y-8">
            <AnimatePresence initial={false}>
              {roots.map((p) => (
                <m.div
                  key={p.id}
                  layout="position"
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  variants={nbFadeUp}
                  transition={nbTransitions.micro}
                >
                  <PathCardLarge path={p} />
                  {renderTree(p.id, new Set([String(p.id)]))}
                </m.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </Container>
    </div>
  );
}
