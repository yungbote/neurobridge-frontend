import React, { useMemo } from "react";
import { Files } from "lucide-react";
import { AnimatePresence, m } from "framer-motion";

import { useMaterials } from "@/app/providers/MaterialProvider";
import { EmptyContent } from "@/shared/components/EmptyContent";
import { Container } from "@/shared/layout/Container";
import type { MaterialFile } from "@/shared/types/models";
import { MaterialCardLarge, MaterialCardLargeSkeleton } from "@/features/files/components/MaterialCardLarge";
import { nbFadeUp, nbTransitions } from "@/shared/motion/presets";
import { useI18n } from "@/app/providers/I18nProvider";
import { Skeleton, SkeletonText } from "@/shared/ui/skeleton";

export function FilesPageSkeleton({ embedded = false }: { embedded?: boolean } = {}) {
  const body = (
    <>
      <div className="mb-10 space-y-3">
        <Skeleton className="h-10 w-56 rounded-full" />
        <SkeletonText lines={2} className="max-w-lg" />
      </div>

      <div className="grid gap-6 grid-cols-[repeat(auto-fill,minmax(min(100%,320px),360px))]">
        {Array.from({ length: 6 }).map((_, i) => (
          // eslint-disable-next-line react/no-array-index-key
          <MaterialCardLargeSkeleton key={i} />
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

export default function FilesPage() {
  const { files, loading } = useMaterials();
  const { t } = useI18n();

  const visible = useMemo(() => {
    const sorted = (files || []).slice().sort((a: MaterialFile, b: MaterialFile) => {
      const ad = new Date(a?.updatedAt || a?.createdAt || 0).getTime();
      const bd = new Date(b?.updatedAt || b?.createdAt || 0).getTime();
      return bd - ad;
    });
    return sorted.slice(0, 60);
  }, [files]);

  if (loading && visible.length === 0) {
    return <FilesPageSkeleton />;
  }

  return (
    <div className="page-surface">
      <Container size="app" className="page-pad">
        <div className="mb-10 space-y-3">
          <h1 className="text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            {t("sidebar.yourFiles")}
          </h1>
          <p className="text-pretty text-sm text-muted-foreground sm:text-base">
            {t("files.subtitle")}
          </p>
        </div>

        {visible.length === 0 ? (
          <EmptyContent
            title={t("sidebar.emptyFiles")}
            message={t("files.empty.message")}
            icon={<Files className="h-7 w-7" />}
          />
        ) : (
          <div className="grid gap-6 grid-cols-[repeat(auto-fill,minmax(min(100%,320px),360px))]">
            <AnimatePresence initial={false}>
              {visible.map((file) => (
                <m.div
                  key={file.id}
                  layout="position"
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  variants={nbFadeUp}
                  transition={nbTransitions.micro}
                >
                  <MaterialCardLarge file={file} />
                </m.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </Container>
    </div>
  );
}
