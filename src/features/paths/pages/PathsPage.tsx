import React, { useMemo } from "react";
import { FolderOpen } from "lucide-react";
import { AnimatePresence, m } from "framer-motion";

import { usePaths } from "@/app/providers/PathProvider";
import { PathCardLarge } from "@/features/paths/components/PathCardLarge";
import { EmptyContent } from "@/shared/components/EmptyContent";
import { Container } from "@/shared/layout/Container";
import { nbFadeUp, nbTransitions } from "@/shared/motion/presets";
import type { Path } from "@/shared/types/models";
import { useI18n } from "@/app/providers/I18nProvider";

type LegacyTimestampPath = { updated_at?: string | null; created_at?: string | null };

function byUpdatedDesc(a: Path, b: Path) {
  const aLegacy = a as Path & LegacyTimestampPath;
  const bLegacy = b as Path & LegacyTimestampPath;
  const ad = new Date(a.updatedAt || aLegacy.updated_at || a.createdAt || aLegacy.created_at || 0).getTime();
  const bd = new Date(b.updatedAt || bLegacy.updated_at || b.createdAt || bLegacy.created_at || 0).getTime();
  return bd - ad;
}

export default function PathsPage() {
  const { paths, loading } = usePaths();
  const { t } = useI18n();

  const list = useMemo(() => {
    const rows = Array.isArray(paths) ? paths.slice() : [];
    return rows
      .filter((p) => !String(p?.id || "").startsWith("job:"))
      .sort(byUpdatedDesc);
  }, [paths]);

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

        {loading && list.length === 0 ? (
          <div className="text-sm text-muted-foreground">{t("paths.loading")}</div>
        ) : list.length === 0 ? (
          <EmptyContent
            title={t("sidebar.emptyPaths")}
            message={t("home.empty.default.description")}
            icon={<FolderOpen className="h-7 w-7" />}
          />
        ) : (
          <div className="grid gap-6 grid-cols-[repeat(auto-fill,minmax(min(100%,320px),360px))]">
            <AnimatePresence initial={false}>
              {list.map((p) => (
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
                </m.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </Container>
    </div>
  );
}
