import { ingestEvents } from "@/shared/api/EventService";
import type { ClientEvent } from "@/shared/types/models";

const MAX_BATCH_SIZE = 200;
const FLUSH_DELAY_MS = 1200;
const MAX_BUFFER_BEFORE_FLUSH = 40;

let buffer: ClientEvent[] = [];
let flushTimer: number | null = null;
let flushing = false;

function makeClientEventId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeQueuedEvent(e: ClientEvent): ClientEvent | null {
  if (!e || typeof e.type !== "string" || !e.type.trim()) return null;
  return {
    ...e,
    type: e.type.trim(),
    occurredAt: e.occurredAt ?? new Date().toISOString(),
    clientEventId: e.clientEventId ?? makeClientEventId(),
  };
}

async function flushInternal(): Promise<void> {
  if (flushing) return;
  if (buffer.length === 0) return;
  flushing = true;

  try {
    while (buffer.length > 0) {
      const batch = buffer.slice(0, MAX_BATCH_SIZE);
      buffer = buffer.slice(batch.length);
      try {
        await ingestEvents(batch);
      } catch (err) {
        // Restore batch to the front (best-effort; avoid losing events).
        buffer = batch.concat(buffer);
        throw err;
      }
    }
  } finally {
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
  const e = normalizeQueuedEvent(event);
  if (!e) return;
  buffer.push(e);
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

