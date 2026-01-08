import type { TextDirection } from "./rtl";
import { dirForLocale } from "./rtl";

export type LocalePreference = "auto" | string;

export type LanguageOption = {
  tag: string;
  label: string;
  nativeLabel: string;
  dir: TextDirection;
};

export const SUPPORTED_UI_LOCALES = ["en", "es", "fr", "de", "pt", "ar", "he"] as const;
export type SupportedUiLocale = (typeof SUPPORTED_UI_LOCALES)[number];

// TODO(i18n): Ship catalogs + QA for these locales, and move them into SUPPORTED_UI_LOCALES.
export const PLANNED_UI_LOCALES = [
  "it",
  "nl",
  "sv",
  "da",
  "no",
  "fi",
  "pl",
  "cs",
  "sk",
  "hu",
  "ro",
  "bg",
  "el",
  "tr",
  "ru",
  "uk",
  "sr",
  "hr",
  "sl",
  "lt",
  "lv",
  "et",
  "id",
  "ms",
  "vi",
  "th",
  "hi",
  "bn",
  "ta",
  "te",
  "mr",
  "gu",
  "kn",
  "ml",
  "pa",
  "ur",
  "fa",
  "ja",
  "ko",
  "zh-Hans",
  "zh-Hant",
] as const;

function primaryLangTag(locale: string): string {
  return String(locale || "")
    .trim()
    .toLowerCase()
    .split(/[-_]/g)[0] || "";
}

export function catalogKeyForLocale(locale: string): SupportedUiLocale | null {
  const primary = primaryLangTag(locale);
  return (SUPPORTED_UI_LOCALES as readonly string[]).includes(primary) ? (primary as SupportedUiLocale) : null;
}

export function isUiLocaleSupported(locale: string): boolean {
  return catalogKeyForLocale(locale) != null;
}

function safeDisplayName(displayNames: Intl.DisplayNames, tag: string): string {
  try {
    const out = displayNames.of(tag);
    return out && String(out).trim() ? String(out).trim() : tag;
  } catch {
    return tag;
  }
}

function buildOptions(tags: readonly string[], uiLocale: string): LanguageOption[] {
  let dnUi: Intl.DisplayNames | null = null;
  try {
    dnUi = new Intl.DisplayNames([uiLocale], { type: "language" });
  } catch {
    dnUi = null;
  }
  const uniq = new Set<string>();
  const options: LanguageOption[] = [];

  for (const tag of tags) {
    const normalized = String(tag).trim();
    if (!normalized) continue;
    if (uniq.has(normalized)) continue;
    uniq.add(normalized);

    const label = dnUi ? safeDisplayName(dnUi, normalized) : normalized;
    let nativeLabel = label;
    try {
      const dnNative = new Intl.DisplayNames([normalized], { type: "language" });
      nativeLabel = safeDisplayName(dnNative, normalized);
    } catch {
      // ignore
    }

    options.push({
      tag: normalized,
      label,
      nativeLabel,
      dir: dirForLocale(normalized),
    });
  }

  options.sort((a, b) => a.label.localeCompare(b.label, uiLocale, { sensitivity: "base" }));
  return options;
}

export function buildLanguageOptions(uiLocale: string): LanguageOption[] {
  return buildOptions(SUPPORTED_UI_LOCALES, uiLocale);
}

export function buildPlannedLanguageOptions(uiLocale: string): LanguageOption[] {
  return buildOptions(PLANNED_UI_LOCALES, uiLocale);
}
