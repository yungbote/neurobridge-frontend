import React from "react";
import { useTheme } from "@/providers/ThemeProvider";

export function AppLogo({ className }) {
  const { theme } = useTheme();
  const lightIcon = "@/assets/logo-icon-light.svg"
  const darkIcon = "@/assets/logo-icon-dark.svg"
  const isSystemDark = window.matchMedia?.("prefers-color-scheme: dark")?.matches;
  const effectiveTheme = theme === "system" ? (isSystemDark ? "dark" : "light") : theme;
  const logo = effectiveTheme === "dark" ? darkIcon : lightIcon;

  return (
    <img src={logo} alt="NeuroBridge" className="h-10 w-auto" />
  );
}
