import React, { createContext, useContext, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Moon, Sun } from "lucide-react";
import { useAuth } from "@/providers/AuthProvider";
import { useUser } from "@/providers/UserProvider";


const VALID = new Set(["light", "dark", "system"]);

export function ThemeSync() {
  const { isAuthenticated } = useAuth();
  const { user } = useUser();
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    if (!isAuthenticated) return;
    const pref = user?.preferredTheme;
    if (!pref || !VALID.has(pref)) return;
    if (theme !== pref) {
      setTheme(pref);
    }
  }, [isAuthenticated, user?.preferredTheme, theme, setTheme]);
  return null;
}
const ThemeContext = createContext({
  theme: "system",
  setTheme: () => {},
  effectiveTheme: "light",
});

function getSystemTheme() {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function ThemeProvider({ children, defaultTheme = "system", storageKey = "vite-ui-theme" }) {
  const [theme, setThemeState] = useState(defaultTheme);
  const [systemTheme, setSystemTheme] = useState(getSystemTheme);

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
  }, [effectiveTheme]);

  function setTheme(next) {
    setThemeState(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(storageKey, next);
    }
  }

  const value = { theme, setTheme, effectiveTheme };

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
    <Button
      variant="outline" 
      size="icon" 
      onClick={handleClick} 
      aria-label="Toggle theme"
      className="rounded-3xl"
    >
      { isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" /> }
    </Button>
  );
}










