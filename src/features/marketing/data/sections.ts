export type MarketingSection = {
  id: string;
  label: string;
};

export const ABOUT_SECTIONS: MarketingSection[] = [
  { id: "overview", label: "Overview" },
  { id: "mission", label: "Mission" },
  { id: "team", label: "Team" },
];

export const FEATURES_SECTIONS: MarketingSection[] = [
  { id: "overview", label: "Overview" },
  { id: "workflows", label: "Workflows" },
  { id: "integrations", label: "Integrations" },
];

export const PRICING_SECTIONS: MarketingSection[] = [
  { id: "overview", label: "Overview" },
  { id: "starter", label: "Starter" },
  { id: "scale", label: "Scale" },
];
