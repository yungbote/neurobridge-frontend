import { Container } from "@/shared/layout/Container";

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






