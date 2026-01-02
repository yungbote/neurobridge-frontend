import { Container } from "@/shared/layout/Container";
import type { ReactNode } from "react";
import type { HomeTabKey } from "@/features/home/components/HomeTabContent";

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
}

export function NavigationTabs({ tabs, activeTab, onTabChange, className = "" }: NavigationTabsProps) {
  return (
    <header className={`w-full border-b border-border bg-background ${className}`}>
      <Container as="nav">
        <div className="flex h-14 items-stretch justify-start gap-4 sm:gap-8 overflow-x-auto scrollbar-none">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              aria-current={activeTab === tab.id ? "page" : undefined}
              className={`
                font-brand relative flex items-center cursor-pointer gap-2.5 whitespace-nowrap py-3 text-base sm:text-lg font-medium transition-all duration-200
                ${activeTab === tab.id ? "text-foreground" : "text-muted-foreground hover:text-foreground/80"}
              `}
            >
              {tab.icon}
              <span>{tab.label}</span>
              {activeTab === tab.id && (
                <span className="absolute inset-x-0 bottom-0 h-[2px] bg-foreground rounded-t-full" />
              )}
            </button>
          ))}
        </div>
      </Container>
    </header>
  );
}








