import { describe, expect, it } from "vitest";

import type { PropertyDescriptor, PropertyFrame, TimeStepMetadata } from "../../../src/reservoir/domain/types";
import { DynamicPropertyController, PropertyFrameCache, PropertyFrameError, type PropertyFrameProvider, type PropertyFrameRequest } from "../../../src/reservoir/dynamic-properties";

const unit = { id: "bar", label: "Bar", symbol: "bar", dimension: "pressure" as const, toBaseFactor: 100_000 };
const descriptor: PropertyDescriptor = {
  id: "pressure",
  keyword: "PRESSURE",
  displayName: "Pressure",
  unit,
  location: "cell",
  valueType: "float32",
  nullRepresentation: { kind: "none" },
  temporalKind: { kind: "dynamic" }
};
const timeSteps: readonly TimeStepMetadata[] = [0, 1, 2].map((index) => ({ index, time: { kind: "simulation-time", value: index, unit }, label: `Step ${index}` }));

function frame(propertyId: string, timeStepIndex: number, values = new Float32Array([timeStepIndex, timeStepIndex + 1])): PropertyFrame {
  const time = timeSteps[timeStepIndex]?.time ?? timeSteps[0]?.time;
  if (!time) {
    throw new Error("Test time step missing.");
  }
  return { propertyId, timeStepIndex, time, values };
}

class ControlledProvider implements PropertyFrameProvider {
  public readonly propertyCatalog = [descriptor];
  public readonly timeStepCatalog = timeSteps;
  public calls = 0;
  public readonly requests: Array<{ request: PropertyFrameRequest; resolve: (frame: PropertyFrame) => void; reject: (error: unknown) => void }> = [];

  public loadFrame(request: PropertyFrameRequest): Promise<PropertyFrame> {
    this.calls += 1;
    return new Promise((resolve, reject) => this.requests.push({ request, resolve, reject }));
  }
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("dynamic property infrastructure", () => {
  it("evicts least-recently-used frames within the configured byte budget", async () => {
    const provider = new ControlledProvider();
    const cache = new PropertyFrameCache(provider, { memoryBudgetBytes: 8 });
    const first = cache.request("pressure", 0);
    provider.requests[0]?.resolve(frame("pressure", 0));
    await first;
    const second = cache.request("pressure", 1);
    provider.requests[1]?.resolve(frame("pressure", 1));
    await second;

    expect(cache.getStats()).toMatchObject({ bytes: 8, entries: 1, evictions: 1 });
    const reloaded = cache.request("pressure", 0);
    expect(provider.calls).toBe(3);
    provider.requests[2]?.resolve(frame("pressure", 0));
    await reloaded;
  });

  it("deduplicates concurrent requests for the same property frame", async () => {
    const provider = new ControlledProvider();
    const cache = new PropertyFrameCache(provider, { memoryBudgetBytes: 64 });
    const first = cache.request("pressure", 0);
    const second = cache.request("pressure", 0);

    expect(provider.calls).toBe(1);
    provider.requests[0]?.resolve(frame("pressure", 0));
    await expect(Promise.all([first, second])).resolves.toEqual([frame("pressure", 0), frame("pressure", 0)]);
    expect(cache.getStats()).toMatchObject({ entries: 1, hits: 0, misses: 2 });
  });

  it("cancels an unshared in-flight request when its consumer aborts", async () => {
    const provider = new ControlledProvider();
    const cache = new PropertyFrameCache(provider, { memoryBudgetBytes: 64 });
    const abort = new AbortController();
    const request = cache.request("pressure", 0, abort.signal);
    abort.abort();

    await expect(request).rejects.toMatchObject({ code: "cancelled" } satisfies Partial<PropertyFrameError>);
    expect(provider.requests[0]?.request.signal.aborted).toBe(true);
  });

  it("ignores stale asynchronous responses after a newer time-step request", async () => {
    const provider = new ControlledProvider();
    const cache = new PropertyFrameCache(provider, { memoryBudgetBytes: 128 });
    const applied: number[] = [];
    const controller = new DynamicPropertyController(cache, 3, { onFrame: (loaded) => applied.push(loaded.timeStepIndex), onError: () => undefined });

    controller.selectProperty("pressure");
    controller.selectTimeStep(1);
    expect(provider.requests).toHaveLength(2);
    provider.requests[1]?.resolve(frame("pressure", 1));
    await flush();
    provider.requests[0]?.resolve(frame("pressure", 0));
    await flush();

    expect(applied).toEqual([1]);
  });

  it("does not let a prior property response overwrite a new property selection", async () => {
    const provider = new ControlledProvider();
    const cache = new PropertyFrameCache(provider, { memoryBudgetBytes: 128 });
    const applied: string[] = [];
    const controller = new DynamicPropertyController(cache, 3, { onFrame: (loaded) => applied.push(loaded.propertyId), onError: () => undefined });

    controller.selectProperty("pressure");
    controller.selectProperty("saturation");
    provider.requests[1]?.resolve(frame("saturation", 0));
    await flush();
    provider.requests[0]?.resolve(frame("pressure", 0));
    await flush();

    expect(applied).toEqual(["saturation"]);
  });

  it("accounts for value and validity-mask bytes in cache statistics", async () => {
    const provider = new ControlledProvider();
    const cache = new PropertyFrameCache(provider, { memoryBudgetBytes: 64 });
    const request = cache.request("pressure", 0);
    provider.requests[0]?.resolve({ ...frame("pressure", 0, new Float32Array([1, 2, 3])), validityMask: new Uint8Array([1, 1, 0]) });
    await request;

    expect(cache.getStats()).toMatchObject({ bytes: 15, entries: 1 });
  });

  it("pauses playback after an unrecoverable frame error", async () => {
    const provider = new ControlledProvider();
    const cache = new PropertyFrameCache(provider, { memoryBudgetBytes: 64 });
    const controller = new DynamicPropertyController(cache, 3, { onFrame: () => undefined, onError: () => undefined });

    controller.selectProperty("pressure");
    provider.requests[0]?.resolve(frame("pressure", 0));
    await flush();
    controller.play();
    controller.tick();
    provider.requests[1]?.reject(new Error("provider unavailable"));
    await flush();

    expect(controller.getState()).toMatchObject({ playing: false, lastError: "provider unavailable" });
    controller.dispose();
  });
});