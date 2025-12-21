import { Container } from "@/layout/Container";

// sections are exported so the nav can use them
export const ABOUT_SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "mission", label: "Mission" },
  { id: "team", label: "Team" },
];

export default function AboutPage() {
  return (
    <div className="min-h-svh bg-background">
      <Container className="py-10 sm:py-16">
        <section id="overview" className="scroll-mt-24 py-10 sm:py-16">
          <h1 className="text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            About Neurobridge
          </h1>
          {/* ... */}
        </section>

        <section id="mission" className="scroll-mt-24 py-10 sm:py-16">
          <h2 className="text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Our Mission
          </h2>
          {/* ... */}
        </section>

        <section id="team" className="scroll-mt-24 py-10 sm:py-16">
          <h2 className="text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Team
          </h2>
          {/* ... */}
        </section>
      </Container>
    </div>
  );
}








