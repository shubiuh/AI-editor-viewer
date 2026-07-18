import type { PropertyFrame } from "../domain/types";
import { frameKey, PropertyFrameError, type PropertyFrameCacheStats, type PropertyFramePerformanceSample, type PropertyFrameProvider } from "./types";

export interface PropertyFrameCacheOptions {
  readonly memoryBudgetBytes: number;
  readonly onPerformanceSample?: (sample: PropertyFramePerformanceSample) => void;
}

interface CachedFrame {
  readonly frame: PropertyFrame;
  readonly bytes: number;
}

interface InflightFrame {
  readonly controller: AbortController;
  readonly promise: Promise<PropertyFrame>;
  consumers: number;
}

export class PropertyFrameCache {
  private readonly frames = new Map<string, CachedFrame>();
  private readonly inflight = new Map<string, InflightFrame>();
  private bytes = 0;
  private hits = 0;
  private misses = 0;
  private evictions = 0;

  public constructor(private readonly provider: PropertyFrameProvider, private readonly options: PropertyFrameCacheOptions) {
    if (!Number.isSafeInteger(options.memoryBudgetBytes) || options.memoryBudgetBytes < 0) {
      throw new Error("Property-frame memory budget must be a non-negative integer byte count.");
    }
  }

  public async request(propertyId: string, timeStepIndex: number, signal?: AbortSignal): Promise<PropertyFrame> {
    const key = frameKey(propertyId, timeStepIndex);
    const cached = this.frames.get(key);
    if (cached) {
      this.hits += 1;
      this.frames.delete(key);
      this.frames.set(key, cached);
      this.sample(propertyId, timeStepIndex, "cache-hit", 0);
      return cached.frame;
    }
    this.misses += 1;
    let pending = this.inflight.get(key);
    if (!pending) {
      const controller = new AbortController();
      const started = performance.now();
      const promise = this.provider.loadFrame({ propertyId, timeStepIndex, signal: controller.signal })
        .then((frame) => {
          validateFrame(frame, propertyId, timeStepIndex);
          this.store(key, frame);
          this.sample(propertyId, timeStepIndex, "loaded", performance.now() - started);
          return frame;
        })
        .catch((error: unknown) => {
          this.sample(propertyId, timeStepIndex, isCancelled(error) ? "cancelled" : "failed", performance.now() - started);
          throw error;
        })
        .finally(() => this.inflight.delete(key));
      pending = { controller, promise, consumers: 0 };
      this.inflight.set(key, pending);
    }
    pending.consumers += 1;
    return this.attachConsumer(pending, signal);
  }

  public prefetchAdjacent(propertyId: string, timeStepIndex: number): void {
    for (const adjacent of [timeStepIndex - 1, timeStepIndex + 1]) {
      if (adjacent < 0 || adjacent >= this.provider.timeStepCatalog.length) {
        continue;
      }
      void this.request(propertyId, adjacent).catch(() => undefined);
    }
  }

  public clear(): void {
    for (const pending of this.inflight.values()) {
      pending.controller.abort();
    }
    this.inflight.clear();
    this.frames.clear();
    this.bytes = 0;
  }

  public getStats(): PropertyFrameCacheStats {
    return { bytes: this.bytes, entries: this.frames.size, inflight: this.inflight.size, hits: this.hits, misses: this.misses, evictions: this.evictions };
  }

  private attachConsumer(pending: InflightFrame, signal: AbortSignal | undefined): Promise<PropertyFrame> {
    if (!signal) {
      return pending.promise.finally(() => this.releaseConsumer(pending));
    }
    if (signal.aborted) {
      this.releaseConsumer(pending);
      return Promise.reject(new PropertyFrameError("cancelled", "Property-frame request was cancelled."));
    }
    return new Promise<PropertyFrame>((resolve, reject) => {
      let settled = false;
      const settle = (callback: () => void) => {
        if (settled) {
          return;
        }
        settled = true;
        signal.removeEventListener("abort", onAbort);
        this.releaseConsumer(pending);
        callback();
      };
      const onAbort = () => {
        settle(() => reject(new PropertyFrameError("cancelled", "Property-frame request was cancelled.")));
      };
      signal.addEventListener("abort", onAbort, { once: true });
      pending.promise.then(
        (frame) => {
          settle(() => resolve(frame));
        },
        (error: unknown) => {
          settle(() => reject(error));
        }
      );
    });
  }

  private releaseConsumer(pending: InflightFrame): void {
    pending.consumers -= 1;
    if (pending.consumers <= 0 && this.inflight.size > 0) {
      pending.controller.abort();
    }
  }

  private store(key: string, frame: PropertyFrame): void {
    const bytes = frameByteLength(frame);
    if (bytes > this.options.memoryBudgetBytes) {
      return;
    }
    while (this.bytes + bytes > this.options.memoryBudgetBytes && this.frames.size > 0) {
      const oldestKey = this.frames.keys().next().value;
      if (oldestKey === undefined) {
        break;
      }
      const oldest = this.frames.get(oldestKey);
      this.frames.delete(oldestKey);
      this.bytes -= oldest?.bytes ?? 0;
      this.evictions += 1;
    }
    this.frames.set(key, { frame, bytes });
    this.bytes += bytes;
  }

  private sample(propertyId: string, timeStepIndex: number, outcome: PropertyFramePerformanceSample["outcome"], durationMs: number): void {
    this.options.onPerformanceSample?.({ propertyId, timeStepIndex, outcome, durationMs });
  }
}

export function frameByteLength(frame: PropertyFrame): number {
  return frame.values.byteLength + (frame.validityMask?.byteLength ?? 0);
}

function validateFrame(frame: PropertyFrame, propertyId: string, timeStepIndex: number): void {
  if (frame.propertyId !== propertyId || frame.timeStepIndex !== timeStepIndex || frame.values.length === 0) {
    throw new PropertyFrameError("invalid-frame", "Provider returned an invalid property frame.");
  }
  if (frame.validityMask && frame.validityMask.length !== frame.values.length) {
    throw new PropertyFrameError("invalid-frame", "Property-frame mask length must match values.");
  }
}

function isCancelled(error: unknown): boolean {
  return error instanceof PropertyFrameError && error.code === "cancelled" || error instanceof DOMException && error.name === "AbortError";
}