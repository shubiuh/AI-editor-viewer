import type { PropertyDescriptor, PropertyFrame, TimeStepMetadata } from "../domain/types";

export interface PropertyFrameProvider {
  readonly propertyCatalog: readonly PropertyDescriptor[];
  readonly timeStepCatalog: readonly TimeStepMetadata[];
  loadFrame(request: PropertyFrameRequest): Promise<PropertyFrame>;
}

export interface PropertyFrameRequest {
  readonly propertyId: string;
  readonly timeStepIndex: number;
  readonly signal: AbortSignal;
}

export interface PropertyFrameCacheStats {
  readonly bytes: number;
  readonly entries: number;
  readonly inflight: number;
  readonly hits: number;
  readonly misses: number;
  readonly evictions: number;
}

export interface PropertyFramePerformanceSample {
  readonly propertyId: string;
  readonly timeStepIndex: number;
  readonly outcome: "cache-hit" | "loaded" | "cancelled" | "failed";
  readonly durationMs: number;
}

export type MissingFrameBehavior = "skip" | "pause";
export type DroppedFramePolicy = "drop" | "queue";

export class PropertyFrameError extends Error {
  public constructor(public readonly code: "cancelled" | "missing-frame" | "invalid-frame", message: string) {
    super(message);
    this.name = "PropertyFrameError";
  }
}

export function frameKey(propertyId: string, timeStepIndex: number): string {
  return `${propertyId}\u0000${timeStepIndex}`;
}