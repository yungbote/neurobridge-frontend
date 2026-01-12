import { useCallback, useRef, useEffect } from "react";

export interface SwipeConfig {
  threshold?: number;
  velocityThreshold?: number;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  onSwipeStart?: (direction: "left" | "right" | "up" | "down") => void;
  onSwipeMove?: (deltaX: number, deltaY: number, progress: number) => void;
  onSwipeEnd?: (completed: boolean) => void;
  enabled?: boolean;
  preventScroll?: boolean;
  direction?: "horizontal" | "vertical" | "both";
}

export interface SwipeState {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  startTime: number;
  isSwiping: boolean;
  direction: "horizontal" | "vertical" | null;
}

export function useSwipeGesture<T extends HTMLElement = HTMLElement>(
  config: SwipeConfig = {}
) {
  const {
    threshold = 50,
    velocityThreshold = 0.3,
    onSwipeLeft,
    onSwipeRight,
    onSwipeUp,
    onSwipeDown,
    onSwipeStart,
    onSwipeMove,
    onSwipeEnd,
    enabled = true,
    preventScroll = false,
    direction: allowedDirection = "both",
  } = config;

  const elementRef = useRef<T | null>(null);
  const stateRef = useRef<SwipeState>({
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
    startTime: 0,
    isSwiping: false,
    direction: null,
  });

  const handleTouchStart = useCallback(
    (e: TouchEvent) => {
      if (!enabled) return;
      const touch = e.touches[0];
      if (!touch) return;

      stateRef.current = {
        startX: touch.clientX,
        startY: touch.clientY,
        currentX: touch.clientX,
        currentY: touch.clientY,
        startTime: Date.now(),
        isSwiping: false,
        direction: null,
      };
    },
    [enabled]
  );

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!enabled) return;
      const touch = e.touches[0];
      if (!touch) return;

      const state = stateRef.current;
      state.currentX = touch.clientX;
      state.currentY = touch.clientY;

      const deltaX = state.currentX - state.startX;
      const deltaY = state.currentY - state.startY;
      const absDeltaX = Math.abs(deltaX);
      const absDeltaY = Math.abs(deltaY);

      // Determine direction on first significant movement
      if (!state.direction && (absDeltaX > 10 || absDeltaY > 10)) {
        state.direction = absDeltaX > absDeltaY ? "horizontal" : "vertical";

        // Check if this direction is allowed
        if (
          allowedDirection !== "both" &&
          state.direction !== allowedDirection
        ) {
          return;
        }

        state.isSwiping = true;
        const swipeDir =
          state.direction === "horizontal"
            ? deltaX > 0
              ? "right"
              : "left"
            : deltaY > 0
              ? "down"
              : "up";
        onSwipeStart?.(swipeDir);
      }

      if (state.isSwiping) {
        if (preventScroll) {
          e.preventDefault();
        }

        const maxDelta =
          state.direction === "horizontal" ? absDeltaX : absDeltaY;
        const progress = Math.min(1, maxDelta / threshold);
        onSwipeMove?.(deltaX, deltaY, progress);
      }
    },
    [enabled, threshold, onSwipeStart, onSwipeMove, preventScroll, allowedDirection]
  );

  const handleTouchEnd = useCallback(
    (e: TouchEvent) => {
      if (!enabled) return;

      const state = stateRef.current;
      if (!state.isSwiping) {
        onSwipeEnd?.(false);
        return;
      }

      const deltaX = state.currentX - state.startX;
      const deltaY = state.currentY - state.startY;
      const absDeltaX = Math.abs(deltaX);
      const absDeltaY = Math.abs(deltaY);
      const elapsed = Date.now() - state.startTime;

      // Calculate velocity (px/ms)
      const velocity =
        state.direction === "horizontal"
          ? absDeltaX / elapsed
          : absDeltaY / elapsed;

      // Determine if swipe completed (threshold met or fast enough)
      const meetsThreshold =
        state.direction === "horizontal"
          ? absDeltaX >= threshold
          : absDeltaY >= threshold;
      const meetsVelocity = velocity >= velocityThreshold;
      const completed = meetsThreshold || meetsVelocity;

      if (completed) {
        if (state.direction === "horizontal") {
          if (deltaX > 0) {
            onSwipeRight?.();
          } else {
            onSwipeLeft?.();
          }
        } else {
          if (deltaY > 0) {
            onSwipeDown?.();
          } else {
            onSwipeUp?.();
          }
        }
      }

      onSwipeEnd?.(completed);

      // Reset state
      stateRef.current = {
        startX: 0,
        startY: 0,
        currentX: 0,
        currentY: 0,
        startTime: 0,
        isSwiping: false,
        direction: null,
      };
    },
    [
      enabled,
      threshold,
      velocityThreshold,
      onSwipeLeft,
      onSwipeRight,
      onSwipeUp,
      onSwipeDown,
      onSwipeEnd,
    ]
  );

  const handleTouchCancel = useCallback(() => {
    onSwipeEnd?.(false);
    stateRef.current = {
      startX: 0,
      startY: 0,
      currentX: 0,
      currentY: 0,
      startTime: 0,
      isSwiping: false,
      direction: null,
    };
  }, [onSwipeEnd]);

  useEffect(() => {
    const element = elementRef.current;
    if (!element || !enabled) return;

    const options: AddEventListenerOptions = { passive: !preventScroll };

    element.addEventListener("touchstart", handleTouchStart, options);
    element.addEventListener("touchmove", handleTouchMove, options);
    element.addEventListener("touchend", handleTouchEnd);
    element.addEventListener("touchcancel", handleTouchCancel);

    return () => {
      element.removeEventListener("touchstart", handleTouchStart);
      element.removeEventListener("touchmove", handleTouchMove);
      element.removeEventListener("touchend", handleTouchEnd);
      element.removeEventListener("touchcancel", handleTouchCancel);
    };
  }, [
    enabled,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleTouchCancel,
    preventScroll,
  ]);

  return { ref: elementRef, isEnabled: enabled };
}

export function useHapticFeedback() {
  const vibrate = useCallback((pattern: number | number[] = 10) => {
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      try {
        navigator.vibrate(pattern);
      } catch {
        // Vibration not supported or blocked
      }
    }
  }, []);

  const lightTap = useCallback(() => vibrate(10), [vibrate]);
  const mediumTap = useCallback(() => vibrate(20), [vibrate]);
  const heavyTap = useCallback(() => vibrate(30), [vibrate]);
  const success = useCallback(() => vibrate([10, 50, 10]), [vibrate]);
  const warning = useCallback(() => vibrate([30, 50, 30]), [vibrate]);
  const error = useCallback(() => vibrate([50, 100, 50, 100, 50]), [vibrate]);

  return {
    vibrate,
    lightTap,
    mediumTap,
    heavyTap,
    success,
    warning,
    error,
  };
}

export function usePullToRefresh(config: {
  onRefresh: () => Promise<void>;
  threshold?: number;
  enabled?: boolean;
}) {
  const { onRefresh, threshold = 80, enabled = true } = config;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pullDistanceRef = useRef(0);
  const isRefreshingRef = useRef(false);
  const startYRef = useRef(0);

  const handleTouchStart = useCallback(
    (e: TouchEvent) => {
      if (!enabled || isRefreshingRef.current) return;
      const container = containerRef.current;
      if (!container || container.scrollTop > 0) return;

      const touch = e.touches[0];
      if (touch) {
        startYRef.current = touch.clientY;
      }
    },
    [enabled]
  );

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!enabled || isRefreshingRef.current) return;
      const container = containerRef.current;
      if (!container || container.scrollTop > 0) return;

      const touch = e.touches[0];
      if (!touch) return;

      const pullDistance = Math.max(0, touch.clientY - startYRef.current);
      pullDistanceRef.current = pullDistance;

      if (pullDistance > 0) {
        e.preventDefault();
        const progress = Math.min(1, pullDistance / threshold);
        container.style.transform = `translateY(${Math.min(pullDistance * 0.5, threshold)}px)`;
        container.style.transition = "none";

        // Dispatch custom event for UI feedback
        container.dispatchEvent(
          new CustomEvent("pullprogress", { detail: { progress, distance: pullDistance } })
        );
      }
    },
    [enabled, threshold]
  );

  const handleTouchEnd = useCallback(async () => {
    if (!enabled || isRefreshingRef.current) return;
    const container = containerRef.current;
    if (!container) return;

    const pullDistance = pullDistanceRef.current;
    pullDistanceRef.current = 0;
    startYRef.current = 0;

    container.style.transition = "transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)";
    container.style.transform = "";

    if (pullDistance >= threshold) {
      isRefreshingRef.current = true;
      container.dispatchEvent(new CustomEvent("refreshstart"));

      try {
        await onRefresh();
      } finally {
        isRefreshingRef.current = false;
        container.dispatchEvent(new CustomEvent("refreshend"));
      }
    }
  }, [enabled, threshold, onRefresh]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !enabled) return;

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
  }, [enabled, handleTouchStart, handleTouchMove, handleTouchEnd]);

  return { ref: containerRef };
}
