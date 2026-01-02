import React from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/shared/ui/card";
import { cn } from "@/shared/lib/utils";

// If you DON'T have cn, uncomment this simple version:
// function cn(...classes) {
//   return classes.filter(Boolean).join(" ");
// }

type AppCardProps = {
  title?: React.ReactNode;
  description?: React.ReactNode;
  headerRight?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  headerClassName?: string;
  contentClassName?: string;
  footerClassName?: string;
};

export function AppCard({
  title,
  description,
  headerRight,
  children,
  footer,
  className,
  headerClassName,
  contentClassName,
  footerClassName,
}: AppCardProps) {
  const hasHeader = title || description || headerRight;
  const hasFooter = !!footer;

  return (
    <Card
      className={cn(
        // Shared visual identity for ALL cards
        "bg-card border border-border rounded-xl shadow-sm",
        "overflow-hidden", // smooth edges with rounded corners
        className
      )}
    >
      {hasHeader && (
        <CardHeader
          className={cn(
            "flex flex-row items-start justify-between gap-3",
            "pb-3", // tighten space between header and content
            headerClassName
          )}
        >
          <div className="space-y-1">
            {title && (
              <CardTitle className="text-sm font-semibold tracking-tight">
                {title}
              </CardTitle>
            )}
            {description && (
              <CardDescription className="text-xs text-muted-foreground">
                {description}
              </CardDescription>
            )}
          </div>

          {headerRight && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {headerRight}
            </div>
          )}
        </CardHeader>
      )}

      {children && (
        <CardContent
          className={cn(
            "pt-0", // rely on header padding; 0 if header exists
            hasHeader ? "pt-0" : "pt-4", // add top padding if no header
            "pb-4 md:pb-5",
            "text-sm",
            contentClassName
          )}
        >
          {children}
        </CardContent>
      )}

      {hasFooter && (
        <CardFooter
          className={cn(
            "border-t border-border/60 bg-card/60",
            "px-4 md:px-5 py-3",
            "flex items-center justify-end gap-2",
            footerClassName
          )}
        >
          {footer}
        </CardFooter>
      )}
    </Card>
  );
}
