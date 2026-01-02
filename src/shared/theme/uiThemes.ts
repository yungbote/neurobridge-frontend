import type { UiTheme } from "@/shared/types/models";

export const UI_THEME_OPTIONS: Array<{
  id: UiTheme;
  label: string;
  description: string;
  swatches: [string, string, string];
}> = [
  {
    id: "classic",
    label: "Classic",
    description: "Clean neutrals with crisp contrast.",
    swatches: ["#0f172a", "#e2e8f0", "#f8fafc"],
  },
  {
    id: "slate",
    label: "Slate",
    description: "Cool, refined, quietly technical.",
    swatches: ["#101827", "#cbd5e1", "#eef2ff"],
  },
  {
    id: "dune",
    label: "Dune",
    description: "Warm paper tones and soft brass.",
    swatches: ["#3f2e24", "#e6d8c3", "#fbf6ee"],
  },
  {
    id: "sage",
    label: "Sage",
    description: "Natural greens with calm clarity.",
    swatches: ["#1f3f34", "#cfe3d6", "#f4fbf7"],
  },
  {
    id: "aurora",
    label: "Aurora",
    description: "Deep teal with fresh highlights.",
    swatches: ["#0c2f3b", "#cbe9f0", "#f1fbfd"],
  },
  {
    id: "ink",
    label: "Ink",
    description: "Inky blues with confident contrast.",
    swatches: ["#0b1324", "#d1d9e6", "#f7f9fc"],
  },
  {
    id: "linen",
    label: "Linen",
    description: "Soft ivory and warm graphite.",
    swatches: ["#3a2f25", "#e8ddc9", "#fbf6ee"],
  },
  {
    id: "ember",
    label: "Ember",
    description: "Smoky neutrals with amber glow.",
    swatches: ["#2b1b15", "#e9c9a6", "#fdf7f0"],
  },
  {
    id: "harbor",
    label: "Harbor",
    description: "Deep sea blues with cool mist.",
    swatches: ["#0b2736", "#cfe1ee", "#f2f7fb"],
  },
  {
    id: "moss",
    label: "Moss",
    description: "Olive greens with quiet depth.",
    swatches: ["#203325", "#d7e3cf", "#f4f8f2"],
  },
];

export const UI_THEME_IDS = UI_THEME_OPTIONS.map((theme) => theme.id);
export const UI_THEME_SET = new Set<UiTheme>(UI_THEME_IDS);
