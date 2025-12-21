import { Container } from "@/layout/Container";

export const PRICING_SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "starter", label: "Starter" },
  { id: "scale", label: "Scale" },
];

export default function PricingPage() {
  return (
    <div className="min-h-svh bg-background">
      <Container className="py-10 sm:py-16">
        <section id="overview" className="scroll-mt-24 py-10 sm:py-16">
          <h1 className="text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Pricing
          </h1>
        </section>
        <section id="starter" className="scroll-mt-24 py-10 sm:py-16">
          <h2 className="text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Starter
          </h2>
        </section>
        <section id="scale" className="scroll-mt-24 py-10 sm:py-16">
          <h2 className="text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Scale
          </h2>
        </section>
      </Container>
    </div>
  );
}








