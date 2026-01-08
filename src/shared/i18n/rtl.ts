export type TextDirection = "ltr" | "rtl";

const RTL_LANGS = new Set([
  "ar", // Arabic
  "fa", // Persian
  "he", // Hebrew
  "ur", // Urdu
  "ps", // Pashto
  "dv", // Dhivehi
  "ku", // Kurdish (may be RTL depending on script; treat as RTL by default)
  "sd", // Sindhi
  "ug", // Uyghur
  "yi", // Yiddish
]);

function primaryLangTag(locale: string): string {
  return String(locale || "")
    .trim()
    .toLowerCase()
    .split(/[-_]/g)[0] || "";
}

function hasRtlScript(locale: string): boolean {
  // Common RTL scripts in BCP-47 tags.
  // Examples: "az-Arab", "sr-Cyrl" (not RTL), "pa-Arab".
  const parts = String(locale || "").trim().split(/[-_]/g);
  return parts.some((p) => p === "Arab" || p === "Hebr" || p === "Thaa" || p === "Syrc" || p === "Nkoo");
}

export function isRtlLocale(locale: string): boolean {
  const lang = primaryLangTag(locale);
  return RTL_LANGS.has(lang) || hasRtlScript(locale);
}

export function dirForLocale(locale: string): TextDirection {
  return isRtlLocale(locale) ? "rtl" : "ltr";
}

