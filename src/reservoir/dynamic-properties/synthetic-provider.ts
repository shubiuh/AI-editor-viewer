import type { PropertyDescriptor, PropertyFrame, TimeStepMetadata } from "../domain/types";
import { PropertyFrameError, type PropertyFrameProvider, type PropertyFrameRequest } from "./types";

const pressureUnit = { id: "bar", label: "Bar", symbol: "bar", dimension: "pressure" as const, toBaseFactor: 100_000 };
const saturationUnit = { id: "fraction", label: "Fraction", symbol: "-", dimension: "dimensionless" as const, toBaseFactor: 1 };

export class SyntheticPropertyFrameProvider implements PropertyFrameProvider {
  public readonly propertyCatalog: readonly PropertyDescriptor[] = [
    { id: "synthetic-pressure", keyword: "PRESSURE", displayName: "Synthetic pressure", unit: pressureUnit, location: "cell", valueType: "float32", nullRepresentation: { kind: "none" }, temporalKind: { kind: "dynamic" }, range: { min: 180, max: 320 } },
    { id: "synthetic-swat", keyword: "SWAT", displayName: "Synthetic water saturation", unit: saturationUnit, location: "cell", valueType: "float32", nullRepresentation: { kind: "none" }, temporalKind: { kind: "dynamic" }, range: { min: 0, max: 1 } }
  ];
  public readonly timeStepCatalog: readonly TimeStepMetadata[];

  public constructor(private readonly cellCount: number, private readonly frameCount = 12, private readonly latencyMs = 18) {
    const timeUnit = { id: "day", label: "Day", symbol: "d", dimension: "dimensionless" as const, toBaseFactor: 1 };
    this.timeStepCatalog = Array.from({ length: frameCount }, (_, index) => ({ index, time: { kind: "simulation-time", value: index * 30, unit: timeUnit }, label: `Day ${index * 30}` }));
  }

  public async loadFrame(request: PropertyFrameRequest): Promise<PropertyFrame> {
    if (!this.propertyCatalog.some((property) => property.id === request.propertyId) || request.timeStepIndex < 0 || request.timeStepIndex >= this.frameCount) {
      throw new PropertyFrameError("missing-frame", "Synthetic property frame is unavailable.");
    }
    await waitForLatency(this.latencyMs, request.signal);
    const values = new Float32Array(this.cellCount);
    for (let cell = 0; cell < values.length; cell += 1) {
      const phase = request.timeStepIndex / Math.max(1, this.frameCount - 1);
      values[cell] = request.propertyId === "synthetic-pressure"
        ? 320 - phase * 110 - cell * 1.5
        : Math.min(1, Math.max(0, 0.08 + phase * 0.75 + cell / Math.max(1, this.cellCount) * 0.12));
    }
    const metadata = this.timeStepCatalog[request.timeStepIndex];
    if (!metadata) {
      throw new PropertyFrameError("missing-frame", "Synthetic time-step metadata is unavailable.");
    }
    return { propertyId: request.propertyId, timeStepIndex: request.timeStepIndex, time: metadata.time, values };
  }
}

function waitForLatency(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return Promise.reject(new PropertyFrameError("cancelled", "Synthetic property-frame request was cancelled."));
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new PropertyFrameError("cancelled", "Synthetic property-frame request was cancelled."));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}