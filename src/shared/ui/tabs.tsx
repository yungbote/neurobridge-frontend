import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";

import { cn } from "@/shared/lib/utils";

const Tabs = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Root>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Root
    ref={ref}
    data-slot="tabs"
    className={cn("flex flex-col gap-2", className)}
    {...props}
  />
));
Tabs.displayName = TabsPrimitive.Root.displayName;

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    data-slot="tabs-list"
    className={cn(
      // Base styles
      "bg-muted text-muted-foreground inline-flex w-fit items-center justify-center rounded-lg",
      // Touch-friendly sizing
      "h-12 sm:h-10 p-1",
      // Touch optimizations
      "touch-pan-x -webkit-tap-highlight-color-transparent",
      className
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    data-slot="tabs-trigger"
    className={cn(
      // Base styles
      "inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent",
      "text-sm font-medium whitespace-nowrap cursor-pointer",
      // Touch-friendly sizing (44px minimum)
      "h-[calc(100%-2px)] min-h-[40px] sm:min-h-[32px] px-3 py-2 sm:px-2 sm:py-1",
      // Colors
      "text-foreground dark:text-muted-foreground",
      // Active state
      "data-[state=active]:bg-background data-[state=active]:shadow-sm",
      "dark:data-[state=active]:text-foreground dark:data-[state=active]:border-input dark:data-[state=active]:bg-input/30",
      // Transitions
      "nb-motion-fast motion-reduce:transition-none",
      // Touch interactions
      "active:scale-[0.98] touch-manipulation -webkit-tap-highlight-color-transparent",
      // Focus
      "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:outline-ring focus-visible:ring-[3px] focus-visible:outline-1",
      // Disabled
      "disabled:pointer-events-none disabled:opacity-50",
      // Icons
      "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
      className
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    data-slot="tabs-content"
    className={cn("flex-1 outline-none", className)}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
