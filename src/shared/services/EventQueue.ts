import { ingestEvents } from "@/shared/api/EventService";
import type { ClientEvent } from "@/shared/types/models";

const MAX_BATCH_SIZE = 200;
const FLUSH_DELAY_MS = 1200;
const MAX_BUFFER_BEFORE_FLUSH = 40;
const LOGICAL_DEDUPE_TTL_MS = 30_000;
const RECENT_EVENT_MAX = 2048;
const PERSISTED_BUFFER_KEY = "nb_learning_event_queue_v1";
const PERSISTED_BUFFER_MAX = 1200;
const PERSISTED_EVENT_MAX_AGE_MS = 72 * 60 * 60 * 1000;
const DEFAULT_EVENT_VERSION = 1;
const MAX_EVENT_VERSION = 16;
const DEFAULT_DATA_SCHEMA_VERSION = 1;
const MAX_DATA_SCHEMA_VERSION = 16;
const DEFAULT_PROMPT_PAYLOAD_VERSION = 1;
const MAX_PROMPT_PAYLOAD_VERSION = 8;

let buffer: ClientEvent[] = [];
let flushTimer: number | null = null;
let flushing = false;
let lifecycleHooksBound = false;
let persistedBufferLoaded = false;
const recentLogicalIDs = new Map<string, number>();
const recentClientIDs = new Map<string, number>();

function makeClientEventId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function fnv1a32(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function stringValue(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim();
}

function boundedNumber(raw: unknown, min: number, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return min;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

function normalizeEventData(raw: ClientEvent["data"]): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return { ...(raw as Record<string, unknown>) };
  }
  return {};
}

function canUseStorage(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return typeof window.localStorage !== "undefined";
  } catch {
    return false;
  }
}

function normalizeVersion(raw: unknown, fallback: number, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  const rounded = Math.trunc(n);
  if (rounded < 1) return fallback;
  if (rounded > max) return max;
  return rounded;
}

function deriveLogicalEventID(event: ClientEvent, data: Record<string, unknown>): string {
  const explicit = stringValue(data.logical_event_id);
  if (explicit) return explicit;

  const pathID = stringValue(event.pathId);
  const nodeID = stringValue(event.pathNodeId);
  const blockID = stringValue(data.block_id);
  const activeBlockID = stringValue(data.active_block_id);

  switch (event.type.trim().toLowerCase()) {
    case "block_read": {
      if (!blockID) return "";
      return `block_read:v2:${pathID}:${nodeID}:${blockID}`;
    }
    case "block_viewed": {
      if (!blockID) return "";
      return `block_viewed:v2:${pathID}:${nodeID}:${blockID}`;
    }
    case "scroll_depth": {
      if (!nodeID) return "";
      const maxPercent = Math.round(boundedNumber(data.max_percent, 0, 100) / 5) * 5;
      const dwellBucket = Math.floor(boundedNumber(data.dwell_ms, 0, 8 * 60 * 60 * 1000) / 3000);
      const activeBlock = activeBlockID || "none";
      return `scroll_depth:v2:${pathID}:${nodeID}:${activeBlock}:${maxPercent}:${dwellBucket}`;
    }
    default:
      return "";
  }
}

function stableClientEventID(logicalEventID: string): string {
  return `log:v1:${fnv1a32(logicalEventID)}`;
}

function normalizeQueuedEvent(e: ClientEvent): ClientEvent | null {
  if (!e || typeof e.type !== "string" || !e.type.trim()) return null;
  const occurredAt = e.occurredAt ?? new Date().toISOString();
  const data = normalizeEventData(e.data);
  const eventVersion = normalizeVersion(e.eventVersion ?? data.event_version, DEFAULT_EVENT_VERSION, MAX_EVENT_VERSION);
  const dataSchemaVersion = normalizeVersion(
    data.data_schema_version,
    DEFAULT_DATA_SCHEMA_VERSION,
    MAX_DATA_SCHEMA_VERSION
  );
  data.event_version = eventVersion;
  data.data_schema_version = dataSchemaVersion;
  if (typeof data.occurred_at !== "string" || !data.occurred_at.trim()) {
    data.occurred_at = occurredAt;
  }
  const hasPromptID = typeof data.prompt_id === "string" && data.prompt_id.trim();
  if (hasPromptID) {
    data.prompt_payload_version = normalizeVersion(
      data.prompt_payload_version,
      DEFAULT_PROMPT_PAYLOAD_VERSION,
      MAX_PROMPT_PAYLOAD_VERSION
    );
  }
  const logicalEventID = deriveLogicalEventID(e, data);
  if (logicalEventID) {
    data.logical_event_id = logicalEventID;
  }
  const clientEventId = e.clientEventId ?? (logicalEventID ? stableClientEventID(logicalEventID) : makeClientEventId());
  if (typeof data.correlation_id !== "string" || !data.correlation_id.trim()) {
    data.correlation_id = `evt:${clientEventId}`;
  }
  if (
    (typeof data.prompt_instance_id !== "string" || !data.prompt_instance_id.trim()) &&
    typeof data.prompt_id === "string" &&
    data.prompt_id.trim()
  ) {
    data.prompt_instance_id = data.prompt_id.trim();
  }
  return {
    ...e,
    type: e.type.trim(),
    occurredAt,
    eventVersion,
    clientEventId,
    data: data as ClientEvent["data"],
  };
}

function trimPersistedQueue(events: ClientEvent[]): ClientEvent[] {
  const now = Date.now();
  const out: ClientEvent[] = [];
  for (const raw of events) {
    const normalized = normalizeQueuedEvent(raw);
    if (!normalized) continue;
    const occurredAtMs = Date.parse(String(normalized.occurredAt || ""));
    if (Number.isFinite(occurredAtMs) && now - occurredAtMs > PERSISTED_EVENT_MAX_AGE_MS) {
      continue;
    }
    out.push(normalized);
    if (out.length >= PERSISTED_BUFFER_MAX) {
      break;
    }
  }
  return out;
}

function loadPersistedBuffer(): void {
  if (persistedBufferLoaded) return;
  persistedBufferLoaded = true;
  if (!canUseStorage()) return;
  try {
    const raw = window.localStorage.getItem(PERSISTED_BUFFER_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return;
    const restored = trimPersistedQueue(parsed as ClientEvent[]);
    if (restored.length === 0) {
      window.localStorage.removeItem(PERSISTED_BUFFER_KEY);
      return;
    }
    buffer = restored.concat(buffer).slice(-PERSISTED_BUFFER_MAX);
    persistBuffer();
  } catch {
    // Ignore local storage parsing errors and continue with in-memory queue only.
  }
}

function persistBuffer(): void {
  if (!canUseStorage()) return;
  try {
    if (buffer.length === 0) {
      window.localStorage.removeItem(PERSISTED_BUFFER_KEY);
      return;
    }
    const trimmed = trimPersistedQueue(buffer);
    if (trimmed.length === 0) {
      window.localStorage.removeItem(PERSISTED_BUFFER_KEY);
      buffer = [];
      return;
    }
    buffer = trimmed.slice(-PERSISTED_BUFFER_MAX);
    window.localStorage.setItem(PERSISTED_BUFFER_KEY, JSON.stringify(buffer));
  } catch {
    // Ignore storage quota/unavailable errors; in-memory queue still works.
  }
}

function trimRecent(map: Map<string, number>, now: number): void {
  for (const [key, seenAt] of map.entries()) {
    if (now - seenAt > LOGICAL_DEDUPE_TTL_MS) {
      map.delete(key);
    }
  }
  while (map.size > RECENT_EVENT_MAX) {
    const oldest = map.keys().next();
    if (oldest.done) break;
    map.delete(oldest.value);
  }
}

function shouldDropDuplicate(event: ClientEvent): boolean {
  const now = Date.now();
  trimRecent(recentLogicalIDs, now);
  trimRecent(recentClientIDs, now);

  const data = normalizeEventData(event.data);
  const logicalID = stringValue(data.logical_event_id);
  if (logicalID) {
    const prior = recentLogicalIDs.get(logicalID);
    if (typeof prior === "number" && now - prior <= LOGICAL_DEDUPE_TTL_MS) {
      return true;
    }
    recentLogicalIDs.set(logicalID, now);
  }

  const clientID = stringValue(event.clientEventId);
  if (clientID) {
    const prior = recentClientIDs.get(clientID);
    if (typeof prior === "number" && now - prior <= LOGICAL_DEDUPE_TTL_MS) {
      return true;
    }
    recentClientIDs.set(clientID, now);
  }

  return false;
}

function ensureLifecycleHooks(): void {
  if (lifecycleHooksBound) return;
  if (typeof window === "undefined" || typeof document === "undefined") return;
  lifecycleHooksBound = true;
  const flushBestEffort = () => {
    void flushEvents().catch(() => {
      // swallow; pending buffer will retry on next lifecycle tick
    });
  };
  window.addEventListener("pagehide", flushBestEffort);
  window.addEventListener("beforeunload", flushBestEffort);
  window.addEventListener("online", flushBestEffort);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      flushBestEffort();
    }
  });
}

async function flushInternal(): Promise<void> {
  loadPersistedBuffer();
  if (flushing) return;
  if (buffer.length === 0) return;
  flushing = true;
  persistBuffer();

  try {
    while (buffer.length > 0) {
      const batch = buffer.slice(0, MAX_BATCH_SIZE);
      buffer = buffer.slice(batch.length);
      persistBuffer();
      try {
        await ingestEvents(batch);
      } catch (err) {
        // Restore batch to the front (best-effort; avoid losing events).
        buffer = batch.concat(buffer);
        persistBuffer();
        throw err;
      }
    }
  } finally {
    persistBuffer();
    flushing = false;
  }
}

function scheduleFlush(): void {
  if (flushTimer != null) return;
  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    flushInternal().catch(() => {
      // swallow; next events will retry
    });
  }, FLUSH_DELAY_MS);
}

export function queueEvent(event: ClientEvent): void {
  ensureLifecycleHooks();
  loadPersistedBuffer();
  const e = normalizeQueuedEvent(event);
  if (!e) return;
  if (shouldDropDuplicate(e)) return;
  buffer.push(e);
  persistBuffer();
  if (buffer.length >= MAX_BUFFER_BEFORE_FLUSH) {
    flushInternal().catch(() => {
      // swallow; next events will retry
    });
    return;
  }
  scheduleFlush();
}

export async function flushEvents(): Promise<void> {
  if (flushTimer != null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  await flushInternal();
}
