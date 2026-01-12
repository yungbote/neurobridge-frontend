import * as React from "react";

import { cn } from "@/shared/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        ref={ref}
        type={type}
        data-slot="input"
        className={cn(
          // Base styles with touch-friendly sizing
          "w-full min-w-0 rounded-lg border bg-transparent shadow-xs outline-none",
          // Touch-optimized height (44px minimum on mobile)
          "h-11 sm:h-10 px-4 py-2.5 sm:px-3 sm:py-2",
          // Typography
          "text-base sm:text-sm",
          "placeholder:text-muted-foreground",
          "selection:bg-primary selection:text-primary-foreground",
          // Border and background
          "border-input dark:bg-input/30",
          // File input styles
          "file:text-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium",
          // Transitions
          "nb-motion-fast motion-reduce:transition-none",
          // Focus state
          "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
          // Error state
          "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
          // Disabled state
          "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
          // Touch optimizations
          "-webkit-tap-highlight-color-transparent",
          className
        )}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };








