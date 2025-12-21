import { Container } from "@/layout/Container";

export const FEATURES_SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "workflows", label: "Workflows" },
  { id: "integrations", label: "Integrations" },
];

export default function FeaturesPage() {
  return (
    <div className="min-h-svh bg-background">
      <Container className="py-10 sm:py-16">
        <section id="overview" className="scroll-mt-24 py-10 sm:py-16">
          <h1 className="text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Features
          </h1>
        </section>
        <section id="workflows" className="scroll-mt-24 py-10 sm:py-16">
          <h2 className="text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Workflows
          </h2>
        </section>
        <section id="integrations" className="scroll-mt-24 py-10 sm:py-16">
          <h2 className="text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Integrations
          </h2>
        </section>
      </Container>
    </div>
  );
}








