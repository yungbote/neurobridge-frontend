import React from "react";
import lightLogo from "@/assets/neurobridge_icon_final_light.svg";
import darkLogo from "@/assets/neurobridge_icon_final_dark.svg";
import { useTheme } from "@/app/providers/ThemeProvider";
import { useAuth } from "@/app/providers/AuthProvider";
import { cn } from "@/shared/lib/utils";

type AppLogoProps = {
  className?: string;
};

export function AppLogo({ className }: AppLogoProps) {
  const { effectiveTheme } = useTheme();
  const { isAuthenticated } = useAuth();
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








