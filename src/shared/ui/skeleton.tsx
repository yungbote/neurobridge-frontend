import type { HTMLAttributes } from "react";
import { cn } from "@/shared/lib/utils";

function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn(
        "relative overflow-hidden rounded-md bg-muted/60 dark:bg-muted/40",
        "before:absolute before:inset-0 before:-translate-x-full",
        "before:bg-gradient-to-r before:from-transparent before:via-white/50 before:to-transparent dark:before:via-white/10",
        "before:animate-[nb-skeleton-shimmer_1.25s_ease-in-out_infinite]",
        "motion-reduce:before:animate-none",
        className
      )}
      {...props}
    />
  );
}

function SkeletonText({
  lines = 3,
  className,
  lineClassName,
  ...props
}: {
  lines?: number;
  className?: string;
  lineClassName?: string;
} & HTMLAttributes<HTMLDivElement>) {
  const widths = ["w-11/12", "w-10/12", "w-9/12", "w-8/12", "w-7/12"];
  const count = Math.max(1, Math.min(12, Math.floor(lines)));

  return (
    <div className={cn("space-y-2", className)} {...props}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton
          // eslint-disable-next-line react/no-array-index-key
          key={i}
          className={cn(
            "h-3 rounded-full",
            widths[i % widths.length],
            lineClassName
          )}
        />
      ))}
    </div>
  );
}

function SkeletonHeading({
  className,
  ...props
}: { className?: string } & HTMLAttributes<HTMLDivElement>) {
  return <Skeleton className={cn("h-7 w-2/3 rounded-full", className)} {...props} />;
}

function SkeletonPill({
  className,
  ...props
}: { className?: string } & HTMLAttributes<HTMLDivElement>) {
  return <Skeleton className={cn("h-5 w-16 rounded-full", className)} {...props} />;
}

function SkeletonCircle({
  className,
  ...props
}: { className?: string } & HTMLAttributes<HTMLDivElement>) {
  return <Skeleton className={cn("size-10 rounded-full", className)} {...props} />;
}

export { Skeleton, SkeletonCircle, SkeletonHeading, SkeletonPill, SkeletonText };
