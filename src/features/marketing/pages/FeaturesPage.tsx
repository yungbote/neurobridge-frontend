import { Container } from "@/shared/layout/Container";

export default function FeaturesPage() {
  return (
    <div className="page-surface">
      <Container className="page-pad">
        <section id="overview" className="scroll-mt-24 section-pad">
          <h1 className="text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Features
          </h1>
        </section>
        <section id="workflows" className="scroll-mt-24 section-pad">
          <h2 className="text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Workflows
          </h2>
        </section>
        <section id="integrations" className="scroll-mt-24 section-pad">
          <h2 className="text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Integrations
          </h2>
        </section>
      </Container>
    </div>
  );
}






