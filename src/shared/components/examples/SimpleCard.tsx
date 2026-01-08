import { AppCard } from "@/shared/components/AppCard";

export default function SimpleAppCard() {
  return (
    <AppCard
      title="Summary & Key ideas"
      description="Auto-generated supports for this passage"
    >
      <ul className="list-disc ps-5 space-y-1">
        <li>Key idea one</li>
        <li>Key idea two</li>
        <li>Key idea three</li>
      </ul>
    </AppCard>
  );
}
