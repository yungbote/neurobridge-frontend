export const FEATURES_SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "workflows", label: "Workflows" },
  { id: "integrations", label: "Integrations" },
];

export default function FeaturesPage() {
  return (
    <div>
      <section id="overview" className="py-16">
        <h1 className="text-3xl font-semibold mb-4">Features</h1>
      </section>
      <section id="workflows" className="py-16">
        <h2 className="text-2xl font-semibold mb-2">Workflows</h2>
      </section>
      <section id="integrations" className="py-16">
        <h2 className="text-2xl font-semibold mb-2">Integrations</h2>
      </section>
    </div>
  );
}










