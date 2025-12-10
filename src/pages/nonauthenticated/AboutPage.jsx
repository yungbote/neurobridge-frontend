// sections are exported so the nav can use them
export const ABOUT_SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "mission", label: "Mission" },
  { id: "team", label: "Team" },
];

export default function AboutPage() {
  return (
    <div>
      <section id="overview" className="py-16">
        <h1 className="text-3xl font-semibold mb-4">About Neurobridge</h1>
        {/* ... */}
      </section>

      <section id="mission" className="py-16">
        <h2 className="text-2xl font-semibold mb-2">Our Mission</h2>
        {/* ... */}
      </section>

      <section id="team" className="py-16">
        <h2 className="text-2xl font-semibold mb-2">Team</h2>
        {/* ... */}
      </section>
    </div>
  );
}










