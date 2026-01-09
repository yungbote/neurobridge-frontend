import { Container } from "@/shared/layout/Container";
import { Skeleton, SkeletonText } from "@/shared/ui/skeleton";

export function PricingPageSkeleton({ embedded = false }: { embedded?: boolean } = {}) {
  const body = (
    <>
      <section className="section-pad space-y-4">
        <Skeleton className="h-10 w-48 rounded-full" />
        <SkeletonText lines={3} className="max-w-2xl" />
      </section>

      <section className="section-pad space-y-4">
        <Skeleton className="h-8 w-40 rounded-full" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-40 w-full rounded-2xl" />
          <Skeleton className="h-40 w-full rounded-2xl" />
          <Skeleton className="h-40 w-full rounded-2xl" />
        </div>
      </section>

      <section className="section-pad space-y-4">
        <Skeleton className="h-8 w-32 rounded-full" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-40 w-full rounded-2xl" />
          <Skeleton className="h-40 w-full rounded-2xl" />
          <Skeleton className="h-40 w-full rounded-2xl" />
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

export default function PricingPage() {
  return (
    <div className="page-surface">
      <Container className="page-pad">
        <section id="overview" className="scroll-mt-24 section-pad">
          <h1 className="text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Pricing
          </h1>
        </section>
        <section id="starter" className="scroll-mt-24 section-pad">
          <h2 className="text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Starter
          </h2>
        </section>
        <section id="scale" className="scroll-mt-24 section-pad">
          <h2 className="text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Scale
          </h2>
        </section>
      </Container>
    </div>
  );
}





