import { Container } from "@/shared/layout/Container";
import type { ReactNode } from "react";
import type { HomeTabKey } from "@/features/home/components/HomeTabContent";
import { cn } from "@/shared/lib/utils";

interface NavigationTab {
  id: HomeTabKey;
  label: string;
  icon?: ReactNode;
}

interface NavigationTabsProps {
  tabs: NavigationTab[];
  activeTab: HomeTabKey;
  onTabChange: (tab: HomeTabKey) => void;
  className?: string;
  variant?: "page" | "navbar";
}

export function NavigationTabs({
  tabs,
  activeTab,
  onTabChange,
  className = "",
  variant = "page",
}: NavigationTabsProps) {
  const isNavbar = String(variant || "").toLowerCase() === "navbar";

  return (
    <header className={cn(
      "w-full",
      isNavbar ? "bg-transparent border-b-0" : "border-b border-border/50 bg-background",
      className
    )}>
      <Container as="nav" size="app">
        {/* Mobile: Scrollable pill tabs (native iOS segment control feel) */}
        <div
          className={cn(
            "flex items-center overflow-x-auto scrollbar-none",
            // Mobile: compact horizontal pills | Desktop: traditional tabs
            "py-3 sm:py-1",
            // Center tabs horizontally
            "justify-center",
            // Responsive height
            "min-h-[56px] sm:h-16 md:h-[72px]",
            // Responsive gaps
            "gap-2 xs:gap-2.5 sm:gap-2 md:gap-3 lg:gap-5",
            // Touch optimizations
            "touch-pan-x -webkit-tap-highlight-color-transparent",
            // Smooth momentum scrolling on iOS
            "-webkit-overflow-scrolling-touch"
          )}
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              aria-current={activeTab === tab.id ? "page" : undefined}
              className={cn(
                "font-brand relative flex cursor-pointer items-center whitespace-nowrap font-medium",
                // Touch-friendly sizing (48px on mobile, 44px tablet, 40px desktop)
                "min-h-[48px] xs:min-h-[48px] sm:min-h-[48px] md:min-h-[44px]",
                // Pill style on mobile, underline style on desktop
                "rounded-full sm:rounded-none",
                // Responsive padding: pill padding on mobile, minimal on desktop
                "px-5 xs:px-6 sm:px-4 md:px-5 lg:px-6 py-3 sm:py-4",
                // Gap between icon and label
                "gap-2.5 sm:gap-2.5 md:gap-3",
                // Typography: larger on mobile for readability, scale up on desktop
                "text-base xs:text-lg sm:text-base md:text-lg lg:text-xl",
                // Transitions
                "nb-motion-fast motion-reduce:transition-none",
                // Mobile: pill background for active | Desktop: text color + underline
                activeTab === tab.id
                  ? "bg-foreground/10 text-foreground sm:bg-transparent"
                  : "text-muted-foreground hover:text-foreground/80 hover:bg-foreground/5 sm:hover:bg-transparent",
                // Touch optimizations
                "touch-manipulation -webkit-tap-highlight-color-transparent select-none",
                // Active press state
                "active:scale-[0.96] active:opacity-80"
              )}
            >
              {/* Icon with responsive sizing */}
              {tab.icon && (
                <span className="flex-shrink-0 [&>svg]:h-5 [&>svg]:w-5 sm:[&>svg]:h-[18px] sm:[&>svg]:w-[18px] md:[&>svg]:h-6 md:[&>svg]:w-6">
                  {tab.icon}
                </span>
              )}
              <span className="tracking-tight sm:tracking-normal">{tab.label}</span>
              {/* Underline indicator: hidden on mobile (pill style), visible on tablet+ */}
              {activeTab === tab.id && (
                <span className={cn(
                  "absolute inset-x-0 bottom-0 rounded-t-full bg-foreground",
                  // Hidden on mobile (pill style), visible on sm+
                  "hidden sm:block",
                  // Responsive indicator height
                  "h-[2px] sm:h-[2.5px] md:h-[3px]"
                )} />
              )}
            </button>
          ))}
        </div>
      </Container>
    </header>
  );
}
