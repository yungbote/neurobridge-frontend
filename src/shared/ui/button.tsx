import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/shared/lib/utils";

const buttonVariants = cva(
  // Base styles with enhanced touch support
  [
    "cursor-pointer",
    "inline-flex items-center justify-center gap-2",
    "whitespace-nowrap rounded-md text-sm font-medium",
    // Touch-optimized: remove tap highlight, add smooth transitions
    "-webkit-tap-highlight-color-transparent",
    "touch-manipulation",
    "select-none",
    // Motion and interactions
    "nb-motion-fast motion-reduce:transition-none",
    "active:scale-[0.97] motion-reduce:active:scale-100",
    "active:opacity-90",
    // Disabled state
    "disabled:pointer-events-none disabled:opacity-50",
    // Icon sizing
    "[&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0",
    // Focus ring
    "outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
    // Error state
    "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  ].join(" "),
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 active:bg-destructive/80 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline:
          "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground active:bg-accent/80 dark:bg-input/30 dark:border-input dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80 active:bg-secondary/70",
        ghost:
          "hover:bg-accent hover:text-accent-foreground active:bg-accent/80 dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline active:opacity-70",
      },
      size: {
        // Touch-optimized sizes - minimum 44px for accessibility
        default: "h-11 px-5 py-2.5 has-[>svg]:px-4",
        sm: "h-10 rounded-md gap-1.5 px-4 has-[>svg]:px-3",
        lg: "h-12 rounded-md px-8 has-[>svg]:px-5 text-base",
        xl: "h-14 rounded-lg px-10 has-[>svg]:px-6 text-base font-semibold",
        // Icon buttons with proper touch targets
        icon: "size-11",
        "icon-sm": "size-10",
        "icon-lg": "size-12",
        "icon-xl": "size-14",
        // Compact for dense UIs where touch is secondary
        compact: "h-8 px-3 py-1.5 text-xs has-[>svg]:px-2",
        "icon-compact": "size-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";

    return (
      <Comp
        ref={ref}
        data-slot="button"
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };





