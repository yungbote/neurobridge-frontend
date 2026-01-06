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
  const base =
    "fixed inset-0 z-[55] bg-black/50 " +
    "data-[state=open]:opacity-100 data-[state=closed]:opacity-0 " +
    "data-[state=closed]:pointer-events-none"

  const motion =
    animation === "none"
      ? "transition-none duration-0"
      : "transition-opacity data-[state=open]:duration-200 data-[state=closed]:duration-150"

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
  ...props
}: React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content> & {
  side?: "top" | "bottom" | "left" | "right";
  animation?: "slide" | "fade" | "none";
  forceMount?: boolean;
}) {
  const base =
    "bg-background fixed z-[56] data-[state=closed]:-z-10 flex flex-col gap-4 shadow-lg outline-none " +
    "data-[state=open]:opacity-100 data-[state=closed]:opacity-0 " +
    "data-[state=closed]:pointer-events-none"

  const sidePos =
    side === "right"
      ? "inset-y-0 right-0 h-full w-3/4 border-l sm:max-w-sm"
      : side === "left"
        ? "inset-y-0 left-0 h-full w-3/4 border-r sm:max-w-sm"
        : side === "top"
          ? "inset-x-0 top-0 w-full border-b"
          : "inset-x-0 bottom-0 w-full border-t"

  // Default closed transform so it mounts offscreen (no “peek then slide away”)
  const closedTransform =
    side === "right"
      ? "translate-x-full"
      : side === "left"
        ? "-translate-x-full"
        : side === "top"
          ? "-translate-y-full"
          : "translate-y-full"

  const openTransform =
    side === "right" || side === "left"
      ? "data-[state=open]:translate-x-0"
      : "data-[state=open]:translate-y-0"

  const motion =
    animation === "none"
      ? "transform-gpu transition-none duration-0"
      : animation === "fade"
        ? "transform-gpu transition-opacity data-[state=open]:duration-150 data-[state=closed]:duration-150"
        : "transform-gpu transition-transform ease-in-out data-[state=open]:duration-500 data-[state=closed]:duration-300"

  const transform =
    animation === "fade" ? "" : cn(closedTransform, openTransform)

  return (
    <SheetPortal forceMount={forceMount}>
      {/* Overlay is NOT force-mounted */}
      <SheetOverlay animation={animation} />

      <SheetPrimitive.Content
        data-slot="sheet-content"
        forceMount={forceMount} // ✅ keep Content mounted if requested
        className={cn(base, sidePos, motion, transform, className)}
        {...props}
      >
        {children}
        <SheetPrimitive.Close className="ring-offset-background focus:ring-ring data-[state=open]:bg-secondary absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none">
          <XIcon className="size-4" />
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






