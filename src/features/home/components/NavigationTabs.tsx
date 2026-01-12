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
      isNavbar ? "bg-transparent border-b-0" : "border-b border-border/50 bg-background/80 backdrop-blur-sm",
      className
    )}>
      <Container as="nav" size="app">
        {/* Mobile: Scrollable pill tabs (native iOS segment control feel) */}
        <div
          className={cn(
            "flex items-center overflow-x-auto scrollbar-none",
            // Mobile: compact horizontal pills | Desktop: traditional tabs
            "py-2.5 sm:py-0",
            // Mobile: centered pills | Desktop: left-aligned tabs
            "justify-start sm:justify-start",
            // Responsive height
            "min-h-[52px] sm:h-14 md:h-16",
            // Responsive gaps
            "gap-1.5 xs:gap-2 sm:gap-1 md:gap-2 lg:gap-4",
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
                "min-h-[44px] xs:min-h-[44px] sm:min-h-[44px] md:min-h-[40px]",
                // Pill style on mobile, underline style on desktop
                "rounded-full sm:rounded-none",
                // Responsive padding: pill padding on mobile, minimal on desktop
                "px-4 xs:px-5 sm:px-3 md:px-4 lg:px-5 py-2.5 sm:py-3",
                // Gap between icon and label
                "gap-2 sm:gap-2 md:gap-2.5",
                // Typography: larger on mobile for readability, scale up on desktop
                "text-[15px] xs:text-base sm:text-sm md:text-base lg:text-lg",
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
                <span className="flex-shrink-0 [&>svg]:h-[18px] [&>svg]:w-[18px] sm:[&>svg]:h-4 sm:[&>svg]:w-4 md:[&>svg]:h-5 md:[&>svg]:w-5">
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


