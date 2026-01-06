import React, { useMemo } from "react";
import { Files } from "lucide-react";
import { AnimatePresence, m } from "framer-motion";

import { useMaterials } from "@/app/providers/MaterialProvider";
import { EmptyContent } from "@/shared/components/EmptyContent";
import { Container } from "@/shared/layout/Container";
import type { MaterialFile } from "@/shared/types/models";
import { MaterialCardLarge } from "@/features/files/components/MaterialCardLarge";
import { nbFadeUp, nbTransitions } from "@/shared/motion/presets";

export default function FilesPage() {
  const { files, loading } = useMaterials();

  const visible = useMemo(() => {
    const sorted = (files || []).slice().sort((a: MaterialFile, b: MaterialFile) => {
      const ad = new Date(a?.updatedAt || a?.createdAt || 0).getTime();
      const bd = new Date(b?.updatedAt || b?.createdAt || 0).getTime();
      return bd - ad;
    });
    return sorted.slice(0, 60);
  }, [files]);

  return (
    <div className="page-surface">
      <Container size="app" className="page-pad">
        <div className="mb-10 space-y-3">
          <h1 className="text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Your files
          </h1>
          <p className="text-pretty text-sm text-muted-foreground sm:text-base">
            Open original uploads in a new tab.
          </p>
        </div>

        {loading && visible.length === 0 ? (
          <div className="text-sm text-muted-foreground">Loading files…</div>
        ) : visible.length === 0 ? (
          <EmptyContent
            title="No files yet"
            message="Upload materials to see your files here."
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
