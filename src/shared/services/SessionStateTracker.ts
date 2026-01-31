import { patchSessionState } from "@/shared/api/SessionService";
import type { SessionStatePatch } from "@/shared/api/SessionService";

type MetadataPatch = Record<string, unknown> | null | undefined;

const META_STATE: { current: Record<string, unknown> } = { current: {} };
let pendingPatch: SessionStatePatch = {};
let pendingMetaPatch: Record<string, unknown> = {};
let flushTimer: number | null = null;
let inFlight = false;
let lastFlushAt = 0;

const MIN_FLUSH_INTERVAL_MS = 700;

function mergeRecord<T extends Record<string, unknown>>(target: T, patch?: Record<string, unknown> | null): T {
  if (!patch) return target;
  for (const [key, value] of Object.entries(patch)) {
    if (typeof value === "undefined") continue;
    target[key as keyof T] = value as T[keyof T];
  }
  return target;
}

function scheduleFlush(delayMs?: number) {
  if (flushTimer != null) return;
  const now = Date.now();
  const elapsed = now - lastFlushAt;
  const delay = typeof delayMs === "number" ? delayMs : Math.max(0, MIN_FLUSH_INTERVAL_MS - elapsed);
  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    void flushSessionPatch();
  }, delay);
}

export function queueSessionPatch(
  patch?: SessionStatePatch | null,
  metadataPatch?: MetadataPatch,
  opts?: { immediate?: boolean }
) {
  const hasPatch = patch && Object.keys(patch).length > 0;
  const hasMeta = metadataPatch && Object.keys(metadataPatch).length > 0;

  if (hasPatch) {
    pendingPatch = mergeRecord(pendingPatch as Record<string, unknown>, patch as Record<string, unknown>) as SessionStatePatch;
  }
  if (hasMeta) {
    META_STATE.current = mergeRecord({ ...META_STATE.current }, metadataPatch as Record<string, unknown>);
    pendingMetaPatch = mergeRecord(pendingMetaPatch, metadataPatch as Record<string, unknown>);
  }

  if (!hasPatch && !hasMeta) return;

  if (opts?.immediate) {
    scheduleFlush(0);
    return;
  }
  scheduleFlush();
}

export function getSessionMetadataSnapshot(): Record<string, unknown> {
  return { ...META_STATE.current };
}

export async function flushSessionPatch() {
  if (inFlight) return;
  const hasPatch = Object.keys(pendingPatch || {}).length > 0;
  const hasMeta = Object.keys(pendingMetaPatch || {}).length > 0;
  if (!hasPatch && !hasMeta) return;

  const payload: SessionStatePatch = { ...(pendingPatch || {}) };
  if (hasMeta) payload.metadata = { ...META_STATE.current };

  const sentPatch = pendingPatch;
  const sentMeta = pendingMetaPatch;
  pendingPatch = {};
  pendingMetaPatch = {};

  inFlight = true;
  try {
    await patchSessionState(payload);
    lastFlushAt = Date.now();
  } catch (err) {
    // Restore pending patches so we can retry later.
    pendingPatch = mergeRecord(pendingPatch as Record<string, unknown>, sentPatch as Record<string, unknown>) as SessionStatePatch;
    pendingMetaPatch = mergeRecord(pendingMetaPatch, sentMeta);
    scheduleFlush(MIN_FLUSH_INTERVAL_MS);
  } finally {
    inFlight = false;
  }
}
