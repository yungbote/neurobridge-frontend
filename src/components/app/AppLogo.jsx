import React from "react";
import lightLogo from "@/assets/neurobridge_icon_final_light.svg";
import darkLogo from "@/assets/neurobridge_icon_final_dark.svg";
import { useTheme } from "@/providers/ThemeProvider";
import { useAuth } from "@/providers/AuthProvider";
import { cn } from "@/lib/utils";

export function AppLogo({ className }) {
  const { theme } = useTheme();
  const { isAuthenticated } = useAuth();
  const isSystemDark = window.matchMedia?.("prefers-color-scheme: dark")?.matches;
  const effectiveTheme = theme === "system" ? (isSystemDark ? "dark" : "light") : theme;
  const logo = effectiveTheme === "dark" ? darkLogo : lightLogo;

  return (
    <div className={cn("flex items-center gap-2 shrink-0", className)}>
      <img src={logo} alt="NeuroBridge" className="h-8 w-auto" />
      {!isAuthenticated  && (
        <span className="mt-2 hidden md:inline text-lg font-semibold text-foreground font-brand">
          NeuroBridge
        </span>
      )}
    </div>
  );
}










