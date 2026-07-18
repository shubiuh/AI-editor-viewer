import { describe, expect, it } from "vitest";

import { extractReservoirSurface } from "../../../src/reservoir/geometry/surface-extractor";
import {
  SurfaceExtractionWorkerClient,
  SurfaceWorkerCancelledError,
  SurfaceWorkerInitializationError,
  type SurfaceWorkerLike
} from "../../../src/reservoir/geometry/surface-worker-client";
import { surfaceWorkerSchemaVersion, type SurfaceWorkerMessage, type SurfaceWorkerRequest } from "../../../src/reservoir/geometry/worker-protocol";
import { createOneByOneByOneFixture } from "../../../src/reservoir/testing/fixtures";

class FakeSurfaceWorker implements SurfaceWorkerLike {
  public onmessage: ((event: MessageEvent<SurfaceWorkerMessage>) => void) | null = null;
  public onerror: ((event: ErrorEvent) => void) | null = null;
  public readonly messages: Array<{ readonly message: SurfaceWorkerRequest; readonly transfer: Transferable[] }> = [];
  public terminated = false;

  public postMessage(message: SurfaceWorkerRequest, transfer: Transferable[]): void {
    this.messages.push({ message, transfer });
  }

  public terminate(): void {
    this.terminated = true;
  }

  public emit(message: SurfaceWorkerMessage): void {
    this.onmessage?.({ data: message } as MessageEvent<SurfaceWorkerMessage>);
  }
}

function input() {
  const fixture = createOneByOneByOneFixture();
  if (fixture.grid.kind !== "corner-point") {
    throw new Error("Synthetic fixture invariant failed.");
  }
  return { kind: "corner-point" as const, geometry: fixture.grid.geometry };
}

function completedGeometry() {
  const outcome = extractReservoirSurface(input());
  if (outcome.status !== "completed") {
    throw new Error("Synthetic extraction invariant failed.");
  }
  return outcome.geometry;
}

describe("surface extraction worker client", () => {
  it("posts versioned requests with transferable buffers and resolves progress/results", async () => {
    const worker = new FakeSurfaceWorker();
    const client = new SurfaceExtractionWorkerClient({ workerFactory: () => worker });
    const progress: number[] = [];
    const task = client.extract(input(), {}, (event) => progress.push(event.fraction));
    const request = worker.messages[0]?.message;

    expect(request?.type).toBe("request");
    expect(request?.schemaVersion).toBe(surfaceWorkerSchemaVersion);
    expect(worker.messages[0]?.transfer.length).toBeGreaterThan(0);

    worker.emit({
      type: "progress",
      schemaVersion: surfaceWorkerSchemaVersion,
      requestId: task.requestId,
      operation: "extract-surface",
      progress: { phase: "classify", completedCellCount: 1, totalCellCount: 1, fraction: 1 }
    });
    worker.emit({
      type: "success",
      schemaVersion: surfaceWorkerSchemaVersion,
      requestId: task.requestId,
      operation: "extract-surface",
      result: completedGeometry()
    });

    await expect(task.result).resolves.toMatchObject({ statistics: { emittedFaceCount: 6 } });
    expect(progress).toEqual([1]);
  });

  it("cancels by terminating, restarts, and ignores stale worker messages", async () => {
    const workers: FakeSurfaceWorker[] = [];
    const client = new SurfaceExtractionWorkerClient({
      workerFactory: () => {
        const worker = new FakeSurfaceWorker();
        workers.push(worker);
        return worker;
      }
    });
    const first = client.extract(input());
    client.cancel(first.requestId);

    await expect(first.result).rejects.toBeInstanceOf(SurfaceWorkerCancelledError);
    expect(workers[0]?.terminated).toBe(true);
    workers[0]?.emit({
      type: "success",
      schemaVersion: surfaceWorkerSchemaVersion,
      requestId: first.requestId,
      operation: "extract-surface",
      result: completedGeometry()
    });

    const second = client.extract(input());
    expect(workers).toHaveLength(2);
    workers[1]?.emit({
      type: "success",
      schemaVersion: surfaceWorkerSchemaVersion,
      requestId: second.requestId,
      operation: "extract-surface",
      result: completedGeometry()
    });
    await expect(second.result).resolves.toMatchObject({ statistics: { emittedFaceCount: 6 } });
  });

  it("returns a fallback error when Worker initialization fails", async () => {
    const client = new SurfaceExtractionWorkerClient({
      workerFactory: () => {
        throw new Error("Worker is unavailable");
      }
    });

    await expect(client.extract(input()).result).rejects.toBeInstanceOf(SurfaceWorkerInitializationError);
  });
});

const supportsBrowserWorker = typeof Worker !== "undefined";

describe.skipIf(!supportsBrowserWorker)("browser worker integration", () => {
  it("extracts geometry through a real Vite worker where supported", async () => {
    const client = new SurfaceExtractionWorkerClient();
    await expect(client.extract(input()).result).resolves.toMatchObject({ statistics: { emittedFaceCount: 6 } });
    client.terminate();
  });
});