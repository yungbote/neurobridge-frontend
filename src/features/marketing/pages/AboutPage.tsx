import { Container } from "@/shared/layout/Container";
import { Skeleton, SkeletonText } from "@/shared/ui/skeleton";

export function AboutPageSkeleton({ embedded = false }: { embedded?: boolean } = {}) {
  const body = (
    <>
      <section className="section-pad space-y-4">
        <Skeleton className="h-10 w-64 rounded-full" />
        <SkeletonText lines={4} className="max-w-2xl" />
      </section>
      <section className="section-pad space-y-4">
        <Skeleton className="h-8 w-48 rounded-full" />
        <SkeletonText lines={5} className="max-w-2xl" />
      </section>
      <section className="section-pad space-y-4">
        <Skeleton className="h-8 w-32 rounded-full" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-28 w-full rounded-2xl" />
          <Skeleton className="h-28 w-full rounded-2xl" />
        </div>
      </section>
    </>
  );

  if (embedded) return <div aria-busy="true">{body}</div>;

  return (
    <div className="page-surface" aria-busy="true">
      <Container className="page-pad">{body}</Container>
    </div>
  );
}

export default function AboutPage() {
  return (
    <div className="page-surface">
      <Container className="page-pad">
        <section id="overview" className="scroll-mt-24 section-pad">
          <h1 className="text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            About Neurobridge
          </h1>
          {/* ... */}
        </section>

        <section id="mission" className="scroll-mt-24 section-pad">
          <h2 className="text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Our Mission
          </h2>
          {/* ... */}
        </section>

        <section id="team" className="scroll-mt-24 section-pad">
          <h2 className="text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Team
          </h2>
          {/* ... */}
        </section>
      </Container>
    </div>
  );
}





