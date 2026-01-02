import type { JsonValue } from "@/shared/types/backend/common";

export type ThemePreference = "light" | "dark" | "system";
export type UiTheme =
  | "classic"
  | "slate"
  | "dune"
  | "sage"
  | "aurora"
  | "ink"
  | "linen"
  | "ember"
  | "harbor"
  | "moss";
export type JsonInput = JsonValue | string | null;
