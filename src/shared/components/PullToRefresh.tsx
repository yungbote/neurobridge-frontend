import * as React from "react";
import { RefreshCw } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { useHapticFeedback } from "@/shared/hooks";

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: React.ReactNode;
  className?: string;
  threshold?: number;
  enabled?: boolean;
}

export function PullToRefresh({
  onRefresh,
  children,
  className,
  threshold = 80,
  enabled = true,
}: PullToRefreshProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [pullDistance, setPullDistance] = React.useState(0);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [isPulling, setIsPulling] = React.useState(false);
  const startYRef = React.useRef(0);
  const haptic = useHapticFeedback();
  const triggeredRef = React.useRef(false);

  const progress = Math.min(1, pullDistance / threshold);
  const isThresholdMet = pullDistance >= threshold;

  React.useEffect(() => {
    if (!enabled) return;
    const container = containerRef.current;
    if (!container) return;

    let currentPullDistance = 0;

    const handleTouchStart = (e: TouchEvent) => {
      if (isRefreshing) return;
      if (container.scrollTop > 0) return;

      const touch = e.touches[0];
      if (touch) {
        startYRef.current = touch.clientY;
        triggeredRef.current = false;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (isRefreshing) return;
      if (container.scrollTop > 0) {
        if (currentPullDistance > 0) {
          currentPullDistance = 0;
          setPullDistance(0);
          setIsPulling(false);
        }
        return;
      }

      const touch = e.touches[0];
      if (!touch) return;

      const distance = Math.max(0, touch.clientY - startYRef.current);

      if (distance > 0) {
        e.preventDefault();
        // Apply resistance - diminishing returns as you pull further
        const resistedDistance = Math.pow(distance, 0.7);
        currentPullDistance = resistedDistance;
        setPullDistance(resistedDistance);
        setIsPulling(true);

        // Haptic feedback when threshold is crossed
        if (resistedDistance >= threshold && !triggeredRef.current) {
          triggeredRef.current = true;
          haptic.mediumTap();
        } else if (resistedDistance < threshold && triggeredRef.current) {
          triggeredRef.current = false;
        }
      }
    };

    const handleTouchEnd = async () => {
      if (isRefreshing) return;

      const wasThresholdMet = currentPullDistance >= threshold;
      currentPullDistance = 0;
      startYRef.current = 0;

      if (wasThresholdMet) {
        setIsRefreshing(true);
        setPullDistance(threshold * 0.6); // Keep indicator visible while refreshing
        haptic.success();

        try {
          await onRefresh();
        } finally {
          setIsRefreshing(false);
          setPullDistance(0);
          setIsPulling(false);
        }
      } else {
        setPullDistance(0);
        setIsPulling(false);
      }
    };

    container.addEventListener("touchstart", handleTouchStart, { passive: true });
    container.addEventListener("touchmove", handleTouchMove, { passive: false });
    container.addEventListener("touchend", handleTouchEnd);
    container.addEventListener("touchcancel", handleTouchEnd);

    return () => {
      container.removeEventListener("touchstart", handleTouchStart);
      container.removeEventListener("touchmove", handleTouchMove);
      container.removeEventListener("touchend", handleTouchEnd);
      container.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, [enabled, threshold, isRefreshing, onRefresh, haptic]);

  return (
    <div
      ref={containerRef}
      className={cn("relative overflow-auto", className)}
      style={{
        WebkitOverflowScrolling: "touch",
      }}
    >
      {/* Pull indicator */}
      <div
        className={cn(
          "absolute left-1/2 -translate-x-1/2 z-10 flex items-center justify-center",
          "w-10 h-10 rounded-full bg-muted border border-border shadow-lg",
          "transition-all duration-200 ease-out",
          (isPulling || isRefreshing) ? "opacity-100" : "opacity-0"
        )}
        style={{
          top: Math.max(-48, pullDistance - 48),
          transform: `translateX(-50%) rotate(${progress * 360}deg) scale(${0.5 + progress * 0.5})`,
        }}
      >
        <RefreshCw
          className={cn(
            "w-5 h-5",
            isThresholdMet || isRefreshing ? "text-primary" : "text-muted-foreground",
            isRefreshing && "animate-spin"
          )}
        />
      </div>

      {/* Content with pull offset */}
      <div
        className="transition-transform duration-200 ease-out"
        style={{
          transform: isPulling || isRefreshing
            ? `translateY(${Math.min(pullDistance, threshold * 1.2)}px)`
            : "translateY(0)",
        }}
      >
        {children}
      </div>
    </div>
  );
}
