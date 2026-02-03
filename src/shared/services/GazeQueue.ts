import { ingestGaze, type GazeHit } from "@/shared/api/GazeService";

type GazeQueueOptions = {
  flushIntervalMs?: number;
  maxBatch?: number;
  maxQueueSize?: number;
  enabled?: () => boolean;
  context?: () => { pathId?: string; nodeId?: string };
};

export class GazeQueue {
  private hits: GazeHit[] = [];
  private timer: number | null = null;
  private inFlight = false;
  private flushIntervalMs: number;
  private maxBatch: number;
  private maxQueueSize: number;
  private enabled?: () => boolean;
  private context?: () => { pathId?: string; nodeId?: string };

  constructor(opts?: GazeQueueOptions) {
    this.flushIntervalMs = opts?.flushIntervalMs ?? 1000;
    this.maxBatch = opts?.maxBatch ?? 200;
    this.maxQueueSize = opts?.maxQueueSize ?? 2000;
    this.enabled = opts?.enabled;
    this.context = opts?.context;
  }

  start() {
    if (this.timer != null) return;
    this.timer = window.setInterval(() => void this.flush(), this.flushIntervalMs);
  }

  stop(flush = true) {
    if (this.timer != null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (flush) void this.flush();
  }

  enqueue(hit: GazeHit) {
    if (!hit || !hit.block_id) return;
    if (this.enabled && !this.enabled()) return;
    if (this.hits.length >= this.maxQueueSize) {
      this.hits.splice(0, Math.max(0, this.hits.length - this.maxQueueSize + 1));
    }
    this.hits.push(hit);
    if (this.hits.length >= this.maxBatch) {
      void this.flush();
    }
  }

  async flush() {
    if (this.inFlight) return;
    if (this.enabled && !this.enabled()) {
      this.hits = [];
      return;
    }
    if (this.hits.length === 0) return;
    const batch = this.hits.splice(0, this.maxBatch);
    if (batch.length === 0) return;
    this.inFlight = true;
    try {
      const ctx = this.context ? this.context() : {};
      await ingestGaze({
        path_id: ctx?.pathId,
        node_id: ctx?.nodeId,
        hits: batch,
      });
    } catch {
      // Drop on failure; gaze is best-effort telemetry.
    } finally {
      this.inFlight = false;
    }
  }
}
