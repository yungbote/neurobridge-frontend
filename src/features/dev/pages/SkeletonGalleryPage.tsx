import React from "react";
import { Container } from "@/shared/layout/Container";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { cn } from "@/shared/lib/utils";
import { Skeleton, SkeletonCircle, SkeletonHeading, SkeletonPill, SkeletonText } from "@/shared/ui/skeleton";

import { PathsPageSkeleton } from "@/features/paths/pages/PathsPage";
import { FilesPageSkeleton } from "@/features/files/pages/FilesPage";
import { HomePageSkeleton } from "@/features/home/pages/HomePage";
import { ChatThreadPageSkeleton } from "@/features/chat/pages/ChatThreadPage";
import { PathPageSkeleton } from "@/features/paths/pages/PathPage";
import { PathNodePageSkeleton } from "@/features/paths/pages/PathNodePage";
import { ActivityPageSkeleton } from "@/features/activity/pages/ActivityPage";
import { PathBuildPageSkeleton } from "@/features/paths/pages/PathBuildPage";
import { AboutPageSkeleton } from "@/features/marketing/pages/AboutPage";
import { FeaturesPageSkeleton } from "@/features/marketing/pages/FeaturesPage";
import { PricingPageSkeleton } from "@/features/marketing/pages/PricingPage";

import { PathCardLargeSkeleton } from "@/features/paths/components/PathCardLarge";
import { MaterialCardLargeSkeleton } from "@/features/files/components/MaterialCardLarge";
import { UserAvatarSkeleton } from "@/features/user/components/UserAvatar";
import { ConceptGraphViewSkeleton } from "@/features/paths/components/ConceptGraphView";
import { PathMaterialsViewSkeleton } from "@/features/paths/components/PathMaterialsView";

function Section({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-2xl border border-border/60 bg-card/60 p-5 shadow-sm", className)}>
      <div className="mb-4">
        <div className="text-sm font-semibold text-foreground">{title}</div>
        {description ? <div className="mt-1 text-xs text-muted-foreground">{description}</div> : null}
      </div>
      {children}
    </section>
  );
}

export default function SkeletonGalleryPage() {
  return (
    <div className="page-surface">
      <Container size="app" className="page-pad">
        <div className="mb-10 space-y-3">
          <h1 className="text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Skeleton gallery
          </h1>
          <p className="text-pretty text-sm text-muted-foreground sm:text-base">
            Canonical loading states for pages and components. Toggle theme in the navbar to QA light/dark variants.
          </p>
        </div>

        <Tabs defaultValue="pages" className="gap-6">
          <TabsList>
            <TabsTrigger value="pages">Pages</TabsTrigger>
            <TabsTrigger value="components">Components</TabsTrigger>
            <TabsTrigger value="primitives">Primitives</TabsTrigger>
          </TabsList>

          <TabsContent value="pages" className="space-y-6">
            <Section title="Home skeleton">
              <div className="rounded-2xl border border-border/60 bg-background/60">
                <HomePageSkeleton embedded />
              </div>
            </Section>

            <Section title="Paths / Files listing skeletons">
              <div className="space-y-10">
                <div className="rounded-2xl border border-border/60 bg-background/60 p-6">
                  <PathsPageSkeleton embedded />
                </div>
                <div className="rounded-2xl border border-border/60 bg-background/60 p-6">
                  <FilesPageSkeleton embedded />
                </div>
              </div>
            </Section>

            <Section title="Chat thread skeleton">
              <div className="rounded-2xl border border-border/60 bg-background/60 p-6">
                <ChatThreadPageSkeleton embedded />
              </div>
            </Section>

            <Section title="Build redirect skeleton" description="Used briefly while redirecting to the build chat thread.">
              <div className="rounded-2xl border border-border/60 bg-background/60 p-6">
                <PathBuildPageSkeleton embedded />
              </div>
            </Section>

            <Section title="Path overview skeleton">
              <div className="rounded-2xl border border-border/60 bg-background/60 p-6">
                <PathPageSkeleton embedded />
              </div>
            </Section>

            <Section title="Unit (lesson) page skeleton">
              <div className="rounded-2xl border border-border/60 bg-background/60 p-6">
                <PathNodePageSkeleton embedded />
              </div>
            </Section>

            <Section title="Activity page skeleton">
              <div className="rounded-2xl border border-border/60 bg-background/60 p-6">
                <ActivityPageSkeleton embedded />
              </div>
            </Section>

            <Section title="Marketing page skeletons" description="Used for fast QA of public surfaces (optional).">
              <div className="space-y-10">
                <div className="rounded-2xl border border-border/60 bg-background/60 p-6">
                  <AboutPageSkeleton embedded />
                </div>
                <div className="rounded-2xl border border-border/60 bg-background/60 p-6">
                  <FeaturesPageSkeleton embedded />
                </div>
                <div className="rounded-2xl border border-border/60 bg-background/60 p-6">
                  <PricingPageSkeleton embedded />
                </div>
              </div>
            </Section>
          </TabsContent>

          <TabsContent value="components" className="space-y-6">
            <Section title="Large cards" description="Used in Paths and Files listings.">
              <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                <PathCardLargeSkeleton />
                <PathCardLargeSkeleton />
                <MaterialCardLargeSkeleton />
                <MaterialCardLargeSkeleton />
              </div>
            </Section>

            <Section title="Path materials view" description="Used in the Path view (Materials tab).">
              <PathMaterialsViewSkeleton />
            </Section>

            <Section title="Concept graph view" description="Used in the Path view (Mindmap tab).">
              <ConceptGraphViewSkeleton />
            </Section>

            <Section title="User avatar" description="Used in the sidebar and account surfaces.">
              <div className="flex items-center gap-6">
                <UserAvatarSkeleton />
                <UserAvatarSkeleton showName />
              </div>
            </Section>
          </TabsContent>

          <TabsContent value="primitives" className="space-y-6">
            <Section title="Skeleton primitives" description="Building blocks for all skeletons.">
              <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                <div className="space-y-3">
                  <div className="text-xs font-medium text-muted-foreground">Heading</div>
                  <SkeletonHeading />
                  <SkeletonHeading className="w-5/12" />
                </div>

                <div className="space-y-3">
                  <div className="text-xs font-medium text-muted-foreground">Text</div>
                  <SkeletonText lines={4} />
                </div>

                <div className="space-y-3">
                  <div className="text-xs font-medium text-muted-foreground">Pills</div>
                  <div className="flex flex-wrap gap-2">
                    <SkeletonPill />
                    <SkeletonPill className="w-20" />
                    <SkeletonPill className="w-14" />
                    <SkeletonPill className="w-24" />
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="text-xs font-medium text-muted-foreground">Circle / avatar</div>
                  <div className="flex items-center gap-3">
                    <SkeletonCircle />
                    <SkeletonCircle className="size-12" />
                    <SkeletonCircle className="size-8" />
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="text-xs font-medium text-muted-foreground">Blocks</div>
                  <Skeleton className="h-28 w-full rounded-2xl" />
                </div>
              </div>
            </Section>
          </TabsContent>
        </Tabs>
      </Container>
    </div>
  );
}
