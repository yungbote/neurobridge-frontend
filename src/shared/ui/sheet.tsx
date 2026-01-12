"use client";

import * as React from "react";
import * as SheetPrimitive from "@radix-ui/react-dialog";
import { XIcon } from "lucide-react";
import { cn } from "@/shared/lib/utils";

const Sheet = SheetPrimitive.Root;
const SheetTrigger = SheetPrimitive.Trigger;
const SheetClose = SheetPrimitive.Close;

// We keep Portal mounted when forceMount is true (so Content can stay mounted)
function SheetPortal({
  forceMount,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return (
    <SheetPrimitive.Portal data-slot="sheet-portal" forceMount={forceMount} {...props} />
  );
}

/**
 * animation:
 *  - "slide" (default): transform-based slide (no keyframes)
 *  - "fade": opacity only
 *  - "none": no transitions
 *
 * IMPORTANT:
 *  - We do NOT forceMount the overlay. It should NOT exist when closed,
 *    otherwise it can steal taps even if transparent.
 */
function SheetOverlay({
  className,
  animation = "slide",
  ...props
}: React.ComponentPropsWithoutRef<typeof SheetPrimitive.Overlay> & {
  animation?: "slide" | "fade" | "none";
}) {
  const base = [
    "fixed inset-0 z-[55] bg-black/50",
    "data-[state=open]:opacity-100 data-[state=closed]:opacity-0",
    "data-[state=closed]:pointer-events-none",
  ].join(" ");

  const motion =
    animation === "none"
      ? "transition-none duration-0"
      : "transition-opacity ease-[var(--nb-ease-out)] data-[state=open]:duration-[var(--nb-dur)] data-[state=closed]:duration-[var(--nb-dur-micro)]";

  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(base, motion, className)}
      {...props}
    />
  );
}

function SheetContent({
  className,
  children,
  side = "right",
  animation = "slide",
  forceMount,
  showHandle = false,
  ...props
}: React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content> & {
  side?: "top" | "bottom" | "left" | "right";
  animation?: "slide" | "fade" | "none";
  forceMount?: boolean;
  showHandle?: boolean;
}) {
  const isBottomSheet = side === "bottom";

  const base = [
    "bg-background fixed z-[56] flex flex-col shadow-2xl outline-none",
    "data-[state=closed]:-z-10",
    "data-[state=open]:opacity-100 data-[state=closed]:opacity-0",
    "data-[state=closed]:pointer-events-none",
    // Touch optimizations
    "touch-pan-y",
    "-webkit-tap-highlight-color-transparent",
  ].join(" ");

  const sidePos =
    side === "right"
      ? "inset-y-0 right-0 h-full w-[85%] max-w-md border-l rounded-l-2xl safe-area-inset-right"
      : side === "left"
        ? "inset-y-0 left-0 h-full w-[85%] max-w-md border-r rounded-r-2xl safe-area-inset-left"
        : side === "top"
          ? "inset-x-0 top-0 w-full border-b rounded-b-2xl max-h-[85vh] safe-area-inset-top"
          : "inset-x-0 bottom-0 w-full border-t rounded-t-2xl max-h-[90vh] safe-area-inset-bottom";

  // Default closed transform so it mounts offscreen (no "peek then slide away")
  const closedTransform =
    side === "right"
      ? "translate-x-full"
      : side === "left"
        ? "-translate-x-full"
        : side === "top"
          ? "-translate-y-full"
          : "translate-y-full";

  const openTransform =
    side === "right" || side === "left"
      ? "data-[state=open]:translate-x-0"
      : "data-[state=open]:translate-y-0";

  const motion =
    animation === "none"
      ? "transform-gpu transition-none duration-0"
      : animation === "fade"
        ? "transform-gpu transition-opacity ease-[var(--nb-ease-out)] duration-[var(--nb-dur)]"
        : "transform-gpu transition-transform ease-[var(--nb-ease-out)] data-[state=open]:duration-[var(--nb-dur-panel)] data-[state=closed]:duration-[var(--nb-dur)]";

  const transform = animation === "fade" ? "" : cn(closedTransform, openTransform);

  return (
    <SheetPortal forceMount={forceMount}>
      {/* Overlay is NOT force-mounted */}
      <SheetOverlay animation={animation} />

      <SheetPrimitive.Content
        data-slot="sheet-content"
        forceMount={forceMount}
        className={cn(base, sidePos, motion, transform, className)}
        {...props}
      >
        {/* Grab handle for bottom sheets */}
        {(showHandle || isBottomSheet) && (
          <div className="flex justify-center pt-3 pb-2 shrink-0">
            <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
          </div>
        )}
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          {children}
        </div>
        <SheetPrimitive.Close
          className={cn(
            "ring-offset-background focus:ring-ring absolute rounded-full",
            "transition-all nb-duration-micro nb-ease-out motion-reduce:transition-none",
            "hover:bg-muted hover:opacity-100 active:scale-95",
            "focus:ring-2 focus:ring-offset-2 focus:outline-hidden",
            "disabled:pointer-events-none",
            // Touch-friendly size
            "size-11 flex items-center justify-center opacity-70",
            "[&_svg]:size-5",
            // Position based on side
            isBottomSheet ? "top-2 end-2" : "top-4 end-4",
            // Tap highlight removal
            "-webkit-tap-highlight-color-transparent touch-manipulation"
          )}
        >
          <XIcon />
          <span className="sr-only">Close</span>
        </SheetPrimitive.Close>
      </SheetPrimitive.Content>
    </SheetPortal>
  );
}

function SheetHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-1.5 p-4", className)}
      {...props}
    />
  );
}

function SheetFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      {...props}
    />
  );
}

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Title>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Title
    ref={ref}
    data-slot="sheet-title"
    className={cn("text-foreground font-semibold", className)}
    {...props}
  />
));
SheetTitle.displayName = SheetPrimitive.Title.displayName;

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Description>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Description
    ref={ref}
    data-slot="sheet-description"
    className={cn("text-muted-foreground text-sm", className)}
    {...props}
  />
));
SheetDescription.displayName = SheetPrimitive.Description.displayName;

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};




