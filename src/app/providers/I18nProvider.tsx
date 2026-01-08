import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { LocalePreference } from "@/shared/i18n/languages";
import { buildLanguageOptions, isUiLocaleSupported } from "@/shared/i18n/languages";
import type { MessageKey } from "@/shared/i18n/messages";
import type { TemplateValues } from "@/shared/i18n/translate";
import { translate } from "@/shared/i18n/translate";

const STORAGE_KEY = "nb:ui:locale";

function readStoredPreference(): LocalePreference {
  if (typeof window === "undefined") return "auto";
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return "auto";
    const v = String(raw).trim();
    if (!v) return "auto";
    return isUiLocaleSupported(v) ? v : "auto";
  } catch {
    return "auto";
  }
}

function writeStoredPreference(value: LocalePreference) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    // ignore
  }
}

function detectBrowserLocales(): string[] {
  if (typeof navigator === "undefined") return ["en"];
  const langs = Array.isArray(navigator.languages) ? navigator.languages : [];
  const fallback = typeof navigator.language === "string" && navigator.language.trim() ? [navigator.language] : [];
  const out = [...langs, ...fallback]
    .filter((l) => typeof l === "string")
    .map((l) => String(l).trim())
    .filter(Boolean);
  return out.length > 0 ? out : ["en"];
}

function resolveLocale(pref: LocalePreference): string {
  if (pref === "auto") {
    const candidates = detectBrowserLocales();
    const match = candidates.find((tag) => isUiLocaleSupported(tag));
    return match ?? "en";
  }
  const cleaned = String(pref).trim();
  if (!cleaned) return "en";
  return isUiLocaleSupported(cleaned) ? cleaned : "en";
}

interface I18nContextValue {
  localePreference: LocalePreference;
  locale: string;
  setLocalePreference: (next: LocalePreference) => void;
  t: (key: MessageKey, values?: TemplateValues) => string;
  languageOptions: ReturnType<typeof buildLanguageOptions>;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [localePreference, setLocalePreferenceState] = useState<LocalePreference>(() => readStoredPreference());
  const locale = useMemo(() => resolveLocale(localePreference), [localePreference]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    root.setAttribute("lang", locale);
    // Keep the app layout direction stable (we do not mirror the UI by locale).
    root.setAttribute("dir", "ltr");
    root.setAttribute("data-locale", locale);
  }, [locale]);

  const setLocalePreference = (next: LocalePreference) => {
    setLocalePreferenceState(next);
    writeStoredPreference(next);
  };

  const t = useMemo(() => {
    return (key: MessageKey, values?: TemplateValues) => translate(locale, key, values);
  }, [locale]);

  const languageOptions = useMemo(() => buildLanguageOptions(locale), [locale]);

  const value = useMemo<I18nContextValue>(
    () => ({ localePreference, locale, setLocalePreference, t, languageOptions }),
    [localePreference, locale, t, languageOptions]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within an I18nProvider");
  return ctx;
}
