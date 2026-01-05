import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/shared/lib/utils";

const badgeVariants = cva(
  [
    "inline-flex items-center justify-center whitespace-nowrap rounded-full border px-2.5 py-1",
    "text-[10px] font-semibold uppercase tracking-wide leading-none",
    "shadow-sm backdrop-blur-sm",
  ].join(" "),
  {
    variants: {
      variant: {
        default: "border-border/60 bg-background/60 text-muted-foreground",
        subtle: "border-border/60 bg-muted/30 text-muted-foreground",
        outline: "border-border/60 bg-transparent text-muted-foreground shadow-none backdrop-blur-0",
        destructive:
          "border-destructive/20 bg-destructive/10 text-destructive shadow-sm backdrop-blur-sm",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}
