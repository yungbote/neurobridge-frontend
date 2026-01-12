import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { XIcon } from "lucide-react";

import { cn } from "@/shared/lib/utils";

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;
const DialogPortal = DialogPrimitive.Portal;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    data-slot="dialog-overlay"
    className={cn(
      "fixed inset-0 z-50 bg-black/40 backdrop-blur-sm",
      "nb-anim-ease-out motion-reduce:animate-none",
      "data-[state=open]:animate-in data-[state=closed]:animate-out",
      "data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0",
      "data-[state=open]:nb-anim-duration data-[state=closed]:nb-anim-duration-micro",
      className
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    showCloseButton?: boolean;
    mobileFullScreen?: boolean;
  }
>(({ className, children, showCloseButton = true, mobileFullScreen = false, ...props }, ref) => {
  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay />

      <DialogPrimitive.Content
        ref={ref}
        data-slot="dialog-content"
        className={cn(
          // Base styles
          "bg-card text-foreground fixed z-[51] grid gap-4 border border-border/40 shadow-2xl",
          "backdrop-blur-xl backdrop-saturate-150",
          "transform-gpu will-change-transform",
          // Animation
          "nb-anim-ease-out motion-reduce:animate-none",
          "data-[state=open]:animate-in data-[state=closed]:animate-out",
          "data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0",
          "data-[state=open]:nb-anim-duration data-[state=closed]:nb-anim-duration-micro",
          // Mobile: slide up from bottom like iOS sheets
          mobileFullScreen
            ? [
                // Mobile full screen with safe areas
                "inset-0 rounded-none p-0",
                "safe-area-inset-top safe-area-inset-bottom",
                "data-[state=open]:slide-in-from-bottom-full data-[state=closed]:slide-out-to-bottom-full",
                // Tablet+: centered modal
                "sm:inset-auto sm:top-[50%] sm:left-[50%] sm:translate-x-[-50%] sm:translate-y-[-50%]",
                "sm:w-full sm:max-w-lg sm:rounded-2xl sm:p-6",
                "sm:data-[state=open]:slide-in-from-bottom-2 sm:data-[state=closed]:slide-out-to-bottom-2",
                "sm:data-[state=open]:zoom-in-98 sm:data-[state=closed]:zoom-out-98",
              ].join(" ")
            : [
                // Default: centered modal with mobile-friendly sizing
                "top-[50%] left-[50%] translate-x-[-50%] translate-y-[-50%]",
                "w-[calc(100%-2rem)] max-w-lg rounded-2xl p-6",
                "max-h-[calc(100vh-4rem)] overflow-y-auto",
                // Mobile: slide up, Desktop: zoom
                "data-[state=open]:slide-in-from-bottom-4 data-[state=closed]:slide-out-to-bottom-4",
                "sm:data-[state=open]:slide-in-from-bottom-2 sm:data-[state=closed]:slide-out-to-bottom-2",
                "sm:data-[state=open]:zoom-in-98 sm:data-[state=closed]:zoom-out-98",
              ].join(" "),
          className
        )}
        {...props}
      >
        {/* Mobile grab handle for sheet-like feel */}
        {mobileFullScreen && (
          <div className="sm:hidden flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
          </div>
        )}
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            className={cn(
              // Base close button styles
              "ring-offset-background focus:ring-ring absolute rounded-full opacity-70",
              "transition-all nb-duration-micro nb-ease-out motion-reduce:transition-none",
              "hover:bg-muted hover:opacity-100 active:scale-95",
              "focus:ring-2 focus:ring-offset-2 focus:outline-hidden",
              "disabled:pointer-events-none",
              "[&_svg]:pointer-events-none [&_svg]:shrink-0",
              // Touch-friendly size (44x44 minimum)
              "size-11 flex items-center justify-center",
              "[&_svg]:size-5",
              // Position - mobile needs more padding
              mobileFullScreen
                ? "top-2 end-2 sm:top-4 sm:end-4 sm:size-9 sm:[&_svg]:size-4"
                : "top-3 end-3 sm:top-4 sm:end-4",
              // Tap highlight removal
              "-webkit-tap-highlight-color-transparent touch-manipulation"
            )}
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
});
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    data-slot="dialog-header"
    className={cn("flex flex-col gap-2 text-center sm:text-start", className)}
    {...props}
  />
);

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    data-slot="dialog-footer"
    className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
    {...props}
  />
);

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    data-slot="dialog-title"
    className={cn("text-xl font-semibold tracking-tight leading-none", className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    data-slot="dialog-description"
    className={cn("text-muted-foreground text-sm leading-relaxed", className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
