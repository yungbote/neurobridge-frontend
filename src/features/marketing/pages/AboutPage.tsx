import { Container } from "@/shared/layout/Container";

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






