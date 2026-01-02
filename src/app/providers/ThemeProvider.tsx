import React, { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { IconButton } from "@/shared/ui/icon-button";
import { Moon, Sun } from "lucide-react";
import { useAuth } from "@/app/providers/AuthProvider";
import { useUser } from "@/app/providers/UserProvider";
import type { ThemePreference, UiTheme } from "@/shared/types/models";
import { UI_THEME_SET } from "@/shared/theme/uiThemes";


type ResolvedTheme = Exclude<ThemePreference, "system">;

const VALID = new Set<ThemePreference>(["light", "dark", "system"]);

interface ThemeContextValue {
  theme: ThemePreference;
  setTheme: (next: ThemePreference) => void;
  effectiveTheme: ResolvedTheme;
  uiTheme: UiTheme;
  setUiTheme: (next: UiTheme) => void;
}

export function ThemeSync() {
  const { isAuthenticated } = useAuth();
  const { user } = useUser();
  const { theme, setTheme, uiTheme, setUiTheme } = useTheme();

  useEffect(() => {
    if (!isAuthenticated) return;
    const pref = user?.preferredTheme;
    if (pref && VALID.has(pref) && theme !== pref) {
      setTheme(pref);
    }
    const uiPref = user?.preferredUiTheme;
    if (uiPref && UI_THEME_SET.has(uiPref) && uiTheme !== uiPref) {
      setUiTheme(uiPref);
    }
  }, [isAuthenticated, user?.preferredTheme, user?.preferredUiTheme, theme, setTheme, uiTheme, setUiTheme]);
  return null;
}
const ThemeContext = createContext<ThemeContextValue>({
  theme: "system",
  setTheme: () => {},
  effectiveTheme: "light",
  uiTheme: "classic",
  setUiTheme: () => {},
});

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

interface ThemeProviderProps {
  children: ReactNode;
  defaultTheme?: ThemePreference;
  storageKey?: string;
  defaultUiTheme?: UiTheme;
  uiStorageKey?: string;
}

export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "vite-ui-theme",
  defaultUiTheme = "classic",
  uiStorageKey = "vite-ui-theme-preset",
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<ThemePreference>(defaultTheme);
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(getSystemTheme);
  const [uiTheme, setUiThemeState] = useState<UiTheme>(defaultUiTheme);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(storageKey);
    if (stored === "light" || stored === "dark" || stored === "system") {
      setThemeState(stored);
    } else {
      setThemeState(defaultTheme);
    }
  }, [defaultTheme, storageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(uiStorageKey);
    if (stored && UI_THEME_SET.has(stored as UiTheme)) {
      setUiThemeState(stored as UiTheme);
    } else {
      setUiThemeState(defaultUiTheme);
    }
  }, [defaultUiTheme, uiStorageKey]);
  
  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      setSystemTheme(media.matches ? "dark" : "light");
    };
    handler();
    media.addEventListener("change", handler);
    return () => media.removeEventListener("change", handler);
  }, []);

  const effectiveTheme = theme === "system" ? systemTheme : theme;

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    if (effectiveTheme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    root.setAttribute("data-theme", effectiveTheme);
    root.setAttribute("data-ui-theme", uiTheme);
  }, [effectiveTheme, uiTheme]);

  function setTheme(next: ThemePreference) {
    setThemeState(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(storageKey, next);
    }
  }

  function setUiTheme(next: UiTheme) {
    setUiThemeState(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(uiStorageKey, next);
    }
  }

  const value = { theme, setTheme, effectiveTheme, uiTheme, setUiTheme };

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeToggle() {
  const { effectiveTheme, setTheme } = useTheme();
  const isDark = effectiveTheme === "dark";
  
  function handleClick() {
    setTheme(isDark ? "light" : "dark");
  }
  
  return (
    <IconButton
      variant="outline"
      size="icon"
      onClick={handleClick}
      label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="rounded-3xl"
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </IconButton>
  );
}






