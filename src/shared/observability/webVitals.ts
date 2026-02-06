export type MetricRating = "good" | "needs-improvement" | "poor";

export type Metric = {
  name: "CLS" | "FCP" | "INP" | "LCP" | "TTFB";
  value: number;
  delta?: number;
  id: string;
  rating?: MetricRating;
  navigationType?: string;
};

type MetricCallback = (metric: Metric) => void;

const hasWindow = typeof window !== "undefined";
const hasPerformance = typeof performance !== "undefined";
const hasObserver = typeof PerformanceObserver !== "undefined";

function safeId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `rum_${Math.random().toString(36).slice(2)}_${Date.now()}`;
}

function getNavigationType(): string | undefined {
  if (!hasPerformance) return undefined;
  const entries = performance.getEntriesByType?.("navigation") as PerformanceNavigationTiming[] | undefined;
  const entry = entries && entries.length ? entries[0] : undefined;
  return entry?.type;
}

function ratingFor(name: Metric["name"], value: number): MetricRating {
  switch (name) {
    case "CLS":
      if (value <= 0.1) return "good";
      if (value <= 0.25) return "needs-improvement";
      return "poor";
    case "FCP":
      if (value <= 1800) return "good";
      if (value <= 3000) return "needs-improvement";
      return "poor";
    case "INP":
      if (value <= 200) return "good";
      if (value <= 500) return "needs-improvement";
      return "poor";
    case "LCP":
      if (value <= 2500) return "good";
      if (value <= 4000) return "needs-improvement";
      return "poor";
    case "TTFB":
      if (value <= 800) return "good";
      if (value <= 1800) return "needs-improvement";
      return "poor";
    default:
      return "needs-improvement";
  }
}

function createMetric(name: Metric["name"], value: number, delta?: number): Metric {
  return {
    name,
    value,
    delta: delta ?? value,
    id: safeId(),
    rating: ratingFor(name, value),
    navigationType: getNavigationType(),
  };
}

function onPageHide(cb: () => void) {
  if (!hasWindow) return;
  const handler = () => cb();
  window.addEventListener("pagehide", handler, { once: true });
  document.addEventListener(
    "visibilitychange",
    () => {
      if (document.visibilityState === "hidden") {
        cb();
      }
    },
    { once: true }
  );
}

export function onFCP(cb: MetricCallback) {
  if (!hasPerformance) return;
  const existing = performance.getEntriesByName?.("first-contentful-paint");
  if (existing && existing.length) {
    cb(createMetric("FCP", existing[0].startTime));
    return;
  }
  if (!hasObserver) return;
  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name === "first-contentful-paint") {
          cb(createMetric("FCP", entry.startTime));
          observer.disconnect();
          break;
        }
      }
    });
    observer.observe({ type: "paint", buffered: true });
  } catch {
    // Ignore unsupported observer types.
  }
}

export function onTTFB(cb: MetricCallback) {
  if (!hasPerformance) return;
  const entries = performance.getEntriesByType?.("navigation") as PerformanceNavigationTiming[] | undefined;
  const navEntry = entries && entries.length ? entries[0] : undefined;
  if (navEntry && navEntry.responseStart >= 0 && navEntry.requestStart >= 0) {
    cb(createMetric("TTFB", navEntry.responseStart - navEntry.requestStart));
    return;
  }
  const timing = performance.timing;
  if (timing && timing.responseStart && timing.requestStart) {
    cb(createMetric("TTFB", timing.responseStart - timing.requestStart));
  }
}

export function onCLS(cb: MetricCallback) {
  if (!hasObserver) return;
  let clsValue = 0;
  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as PerformanceEntry[]) {
        const shift = entry as PerformanceEntry & { value?: number; hadRecentInput?: boolean };
        if (shift.hadRecentInput) continue;
        if (typeof shift.value === "number") {
          clsValue += shift.value;
        }
      }
    });
    observer.observe({ type: "layout-shift", buffered: true });
    onPageHide(() => {
      observer.disconnect();
      cb(createMetric("CLS", clsValue));
    });
  } catch {
    // Ignore unsupported observer types.
  }
}

export function onLCP(cb: MetricCallback) {
  if (!hasObserver) return;
  let lastEntry: PerformanceEntry | undefined;
  try {
    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      if (entries.length) {
        lastEntry = entries[entries.length - 1];
      }
    });
    observer.observe({ type: "largest-contentful-paint", buffered: true });
    onPageHide(() => {
      observer.disconnect();
      if (lastEntry) {
        cb(createMetric("LCP", lastEntry.startTime));
      }
    });
  } catch {
    // Ignore unsupported observer types.
  }
}

export function onINP(cb: MetricCallback) {
  if (!hasObserver) return;
  let maxDuration = 0;
  let hasInp = false;
  let fidValue: number | null = null;
  try {
    const fidObserver = new PerformanceObserver((list) => {
      const entry = list.getEntries()[0] as PerformanceEventTiming | undefined;
      if (entry && typeof entry.processingStart === "number") {
        fidValue = entry.processingStart - entry.startTime;
      }
    });
    fidObserver.observe({ type: "first-input", buffered: true });
  } catch {
    // Ignore first-input if unsupported.
  }
  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as PerformanceEventTiming[]) {
        if (!entry || typeof entry.duration !== "number") continue;
        if (entry.interactionId) {
          hasInp = true;
          if (entry.duration > maxDuration) {
            maxDuration = entry.duration;
          }
        }
      }
    });
    observer.observe({ type: "event", buffered: true, durationThreshold: 40 });
    onPageHide(() => {
      observer.disconnect();
      if (hasInp) {
        cb(createMetric("INP", maxDuration));
      } else if (fidValue !== null) {
        cb(createMetric("INP", fidValue));
      }
    });
  } catch {
    // Ignore unsupported observer types.
  }
}
