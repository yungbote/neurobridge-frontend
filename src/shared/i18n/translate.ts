import type { MessageKey, PartialCatalog } from "./messages";
import { EN_MESSAGES, MESSAGE_CATALOGS } from "./messages";

export type TemplateValues = Record<string, string | number | boolean | null | undefined>;

function formatTemplate(template: string, values?: TemplateValues): string {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const v = values[key];
    return v == null ? "" : String(v);
  });
}

function primaryLang(locale: string): string {
  return String(locale || "")
    .trim()
    .toLowerCase()
    .split(/[-_]/g)[0] || "en";
}

export function catalogForLocale(locale: string): PartialCatalog {
  const lang = primaryLang(locale);
  return MESSAGE_CATALOGS[lang] ?? {};
}

export function translate(locale: string, key: MessageKey, values?: TemplateValues): string {
  const catalog = catalogForLocale(locale);
  const raw = (catalog[key] ?? EN_MESSAGES[key]) as string | undefined;
  return formatTemplate(raw ?? String(key), values);
}

