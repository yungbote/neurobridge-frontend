import {
  Atom,
  Brain,
  CircleDashed,
  Cpu,
  FlaskConical,
  HeartPulse,
  Landmark,
  Leaf,
  ScrollText,
  Sigma,
  Sparkles,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

export const HOME_SECTION_ICON_MAP: Record<string, LucideIcon> = {
  generating: CircleDashed,
  new: Sparkles,

  anchor_physics: Atom,
  anchor_biology: Leaf,
  anchor_chemistry: FlaskConical,
  anchor_mathematics: Sigma,
  anchor_computer_science: Cpu,
  anchor_medicine_health: HeartPulse,
  anchor_psychology_neuroscience: Brain,
  anchor_economics_business: TrendingUp,
  anchor_history: Landmark,
  anchor_philosophy: ScrollText,
};

export function getHomeSectionIcon(iconKey?: string | null): LucideIcon | null {
  const key = String(iconKey || "").trim();
  if (!key) return null;
  return HOME_SECTION_ICON_MAP[key] ?? null;
}

