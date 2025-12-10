export const PRICING_SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "starter", label: "Starter" },
  { id: "scale", label: "Scale" },
];

export default function PricingPage() {
  return (
    <div>
      <section id="overview" className="py-16">
        <h1 className="text-3xl font-semibold mb-4">Pricing</h1>
      </section>
      <section id="starter" className="py-16">
        <h2 className="text-2xl font-semibold mb-2">Starter</h2>
      </section>
      <section id="scale" className="py-16">
        <h2 className="text-2xl font-semibold mb-2">Scale</h2>
      </section>
    </div>
  );
}










