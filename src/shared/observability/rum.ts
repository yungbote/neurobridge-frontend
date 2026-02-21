import { ingestEvents } from "@/shared/api/EventService";
import axiosClient from "@/shared/api/AxiosClient";
import { getAccessToken } from "@/shared/services/StorageService";
import type { ClientEvent } from "@/shared/types/models";
import type { JsonInput } from "@/shared/types/models";
import { onCLS, onFCP, onINP, onLCP, onTTFB, type Metric } from "@/shared/observability/webVitals";
import { trackSecurityEvent } from "@/shared/observability/productEvents";

type RumEventKind = "web_vital" | "api" | "sse" | "error" | "route";

const RUM_ENABLED = parseEnvBool(import.meta.env.VITE_RUM_ENABLED, false);
const RUM_SAMPLE_RATE = clampNumber(Number(import.meta.env.VITE_RUM_SAMPLE_RATE ?? 1), 0, 1);
const RUM_FLUSH_MS = clampNumber(Number(import.meta.env.VITE_RUM_FLUSH_MS ?? 5000), 250, 60_000);
const RUM_MAX_QUEUE = clampNumber(Number(import.meta.env.VITE_RUM_MAX_QUEUE ?? 50), 5, 500);
const RUM_DEBUG = parseEnvBool(import.meta.env.VITE_RUM_DEBUG, false);

let initialized = false;
let active = false;
let sampled = false;
let flushing = false;
let flushTimer: number | null = null;
let queue: ClientEvent[] = [];
let axiosInstalled = false;

const rumSessionId = safeId();

function parseEnvBool(raw: unknown, fallback = false): boolean {
  if (raw === undefined || raw === null) return fallback;
  const val = String(raw).trim().toLowerCase();
  if (val === "1" || val === "true" || val === "yes" || val === "on") return true;
  if (val === "0" || val === "false" || val === "no" || val === "off") return false;
  return fallback;
}

function clampNumber(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function safeId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `rum_${Math.random().toString(36).slice(2)}_${Date.now()}`;
}

function truncate(input: unknown, max = 2000): string | undefined {
  if (input === undefined || input === null) return undefined;
  const str = String(input);
  if (str.length <= max) return str;
  return `${str.slice(0, max)}…`;
}

function nowMs(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function baseContext(): Record<string, unknown> {
  if (typeof window === "undefined") return { rum_session_id: rumSessionId };
  return {
    rum_session_id: rumSessionId,
    path: window.location.pathname,
    route: `${window.location.pathname}${window.location.search}`,
    referrer: document.referrer || undefined,
    viewport: {
      w: window.innerWidth,
      h: window.innerHeight,
      dpr: window.devicePixelRatio || 1,
    },
  };
}

function enqueueEvent(type: string, data: Record<string, unknown>) {
  if (!active) return;
  const evt: ClientEvent = {
    type,
    clientEventId: safeId(),
    occurredAt: new Date().toISOString(),
    data: ({ ...baseContext(), ...data } as JsonInput),
  };
  queue.push(evt);
  if (queue.length >= RUM_MAX_QUEUE) {
    void flush("max_queue");
    return;
  }
  scheduleFlush();
}

function scheduleFlush() {
  if (flushTimer) return;
  if (typeof window === "undefined") return;
  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    void flush("timer");
  }, RUM_FLUSH_MS);
}

async function flush(reason: string) {
  if (!active || flushing || queue.length === 0) return;
  const token = getAccessToken();
  if (!token) {
    queue = [];
    return;
  }
  flushing = true;
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  const batch = queue.slice();
  queue = [];
  try {
    await ingestEvents(batch);
    if (RUM_DEBUG) {
      console.debug("[RUM] flushed", { reason, count: batch.length });
    }
  } catch (err) {
    if (RUM_DEBUG) {
      console.warn("[RUM] flush failed", err);
    }
    queue = batch.concat(queue);
  } finally {
    flushing = false;
  }
}

function recordPerf(kind: RumEventKind, data: Record<string, unknown>) {
  enqueueEvent("client_perf", { kind, ...data });
}

function recordError(data: Record<string, unknown>) {
  enqueueEvent("client_error", data);
}

function recordWebVital(metric: Metric) {
  recordPerf("web_vital", {
    name: metric.name,
    value: metric.value,
    delta: metric.delta,
    rating: metric.rating,
    id: metric.id,
    navigation: metric.navigationType,
  });
}

function extractPath(url: string | undefined, baseURL: string | undefined): string {
  const rawUrl = String(url || "");
  const rawBase = String(baseURL || "");
  const isAbsolute = /^https?:\/\//i.test(rawUrl);
  const full = isAbsolute
    ? rawUrl
    : rawBase
      ? `${rawBase.replace(/\/$/, "")}/${rawUrl.replace(/^\/+/, "")}`
      : rawUrl;
  try {
    const parsed = new URL(full, window.location.origin);
    return parsed.pathname || rawUrl;
  } catch {
    return rawUrl;
  }
}

function shouldIgnorePath(path: string): boolean {
  if (!path) return false;
  return (
    path.startsWith("/events") ||
    path.startsWith("/api/events") ||
    path.startsWith("/sse") ||
    path.startsWith("/api/sse") ||
    path.startsWith("/gaze") ||
    path.startsWith("/api/gaze")
  );
}

function installAxiosInstrumentation() {
  if (axiosInstalled) return;
  axiosInstalled = true;
  axiosClient.interceptors.request.use((config) => {
    if (!active) return config;
    const path = extractPath(config.url, config.baseURL);
    if (shouldIgnorePath(path)) return config;
    (config as { __rumMeta?: { start: number; path: string } }).__rumMeta = {
      start: nowMs(),
      path,
    };
    return config;
  });
  axiosClient.interceptors.response.use(
    (resp) => {
      const meta = (resp.config as { __rumMeta?: { start: number; path: string } })
        .__rumMeta;
      if (meta) {
        const duration = Math.max(0, nowMs() - meta.start);
        recordPerf("api", {
          method: String(resp.config.method || "GET").toUpperCase(),
          path: meta.path,
          status: resp.status,
          ok: resp.status >= 200 && resp.status < 400,
          duration_ms: Math.round(duration),
        });
      }
      return resp;
    },
    (error) => {
      const cfg = error?.config as { __rumMeta?: { start: number; path: string }; method?: string };
      const meta = cfg?.__rumMeta;
      if (meta) {
        const duration = Math.max(0, nowMs() - meta.start);
        const status = error?.response?.status;
        recordPerf("api", {
          method: String(cfg?.method || "GET").toUpperCase(),
          path: meta.path,
          status: typeof status === "number" ? status : undefined,
          ok: false,
          duration_ms: Math.round(duration),
          timeout: error?.code === "ECONNABORTED",
          network_error: !status,
        });
      }
      return Promise.reject(error);
    }
  );
}

function installErrorHandlers() {
  window.addEventListener("error", (event) => {
    recordError({
      kind: "error",
      message: truncate(event.message || "Unknown error"),
      filename: event.filename || undefined,
      lineno: event.lineno || undefined,
      colno: event.colno || undefined,
      stack: truncate(event.error?.stack),
    });
  });
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason as { message?: string; stack?: string } | string | undefined;
    recordError({
      kind: "unhandledrejection",
      message:
        typeof reason === "string"
          ? truncate(reason)
          : truncate(reason?.message || "Unhandled rejection"),
      stack: typeof reason === "object" ? truncate(reason?.stack) : undefined,
    });
  });
  window.addEventListener("securitypolicyviolation", (event) => {
    trackSecurityEvent("csp_violation", {
      data: {
        violated_directive: event.violatedDirective,
        effective_directive: event.effectiveDirective,
        blocked_uri: event.blockedURI,
        status_code: event.statusCode,
      },
    });
  });
}

function installWebVitals() {
  onCLS(recordWebVital);
  onFCP(recordWebVital);
  onINP(recordWebVital);
  onLCP(recordWebVital);
  onTTFB(recordWebVital);
}

function installLifecycleFlush() {
  window.addEventListener("beforeunload", () => {
    void flush("beforeunload");
  });
  window.addEventListener("pagehide", () => {
    void flush("pagehide");
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      void flush("visibility");
    }
  });
  window.addEventListener("online", () => {
    void flush("online");
  });
}

export function initRUM() {
  if (initialized) return;
  initialized = true;
  if (!RUM_ENABLED) return;
  sampled = Math.random() <= RUM_SAMPLE_RATE;
  if (!sampled) return;
  active = true;
  installAxiosInstrumentation();
  installErrorHandlers();
  installWebVitals();
  installLifecycleFlush();
  if (RUM_DEBUG) {
    console.debug("[RUM] enabled", {
      sample_rate: RUM_SAMPLE_RATE,
      flush_ms: RUM_FLUSH_MS,
      max_queue: RUM_MAX_QUEUE,
    });
  }
}

export function recordSse(event: "connect_attempt" | "open" | "error" | "close" | "retry", details?: Record<string, unknown>) {
  recordPerf("sse", {
    event,
    ...(details || {}),
  });
}

export function recordRouteChange(path: string, durationMs?: number) {
  const payload: Record<string, unknown> = { path };
  if (typeof durationMs === "number" && !Number.isNaN(durationMs)) {
    payload.duration_ms = Math.round(durationMs);
  }
  recordPerf("route", payload);
}

export function recordRouteError(path: string, err: unknown) {
  recordError({
    kind: "route",
    path,
    message: truncate((err as { message?: string })?.message || err),
    stack: truncate((err as { stack?: string })?.stack),
  });
}
