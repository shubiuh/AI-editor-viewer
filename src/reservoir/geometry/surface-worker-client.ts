import type { ReservoirSurfaceGeometry, StructuredSurfaceInput, SurfaceExtractionProgress } from "./types";
import {
  surfaceWorkerSchemaVersion,
  type SurfaceWorkerExtractionOptions,
  type SurfaceWorkerMessage,
  type SurfaceWorkerRequest
} from "./worker-protocol";
import { collectSurfaceInputTransferables } from "./worker-transfer";

export interface SurfaceWorkerLike {
  onmessage: ((event: MessageEvent<SurfaceWorkerMessage>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: SurfaceWorkerRequest, transfer: Transferable[]): void;
  terminate(): void;
}

export type SurfaceWorkerFactory = () => SurfaceWorkerLike;

export interface SurfaceWorkerTask {
  readonly requestId: string;
  readonly result: Promise<ReservoirSurfaceGeometry>;
}

export interface SurfaceWorkerClientOptions {
  readonly workerFactory?: SurfaceWorkerFactory;
}

interface PendingTask {
  readonly generation: number;
  readonly resolve: (geometry: ReservoirSurfaceGeometry) => void;
  readonly reject: (error: Error) => void;
  readonly onProgress?: (progress: SurfaceExtractionProgress) => void;
}

export class SurfaceWorkerInitializationError extends Error {
  public constructor(cause: unknown) {
    super("Unable to initialize the reservoir geometry worker. Check browser Web Worker support and retry.");
    this.name = "SurfaceWorkerInitializationError";
    this.cause = cause;
  }
}

export class SurfaceWorkerCancelledError extends Error {
  public constructor() {
    super("Reservoir geometry extraction was cancelled.");
    this.name = "SurfaceWorkerCancelledError";
  }
}

export class SurfaceWorkerRemoteError extends Error {
  public readonly code: string;

  public constructor(code: string, message: string) {
    super(message);
    this.name = "SurfaceWorkerRemoteError";
    this.code = code;
  }
}

export class SurfaceExtractionWorkerClient {
  private worker: SurfaceWorkerLike | undefined;
  private generation = 0;
  private requestSequence = 0;
  private readonly pending = new Map<string, PendingTask>();
  private readonly workerFactory: SurfaceWorkerFactory;

  public constructor(options: SurfaceWorkerClientOptions = {}) {
    this.workerFactory = options.workerFactory ?? createBrowserSurfaceWorker;
  }

  public extract(
    input: StructuredSurfaceInput,
    options: SurfaceWorkerExtractionOptions = {},
    onProgress?: (progress: Extract<SurfaceWorkerMessage, { readonly type: "progress" }> ["progress"]) => void
  ): SurfaceWorkerTask {
    const requestId = `surface-${this.generation}-${++this.requestSequence}`;
    let resolvePromise: (geometry: ReservoirSurfaceGeometry) => void = () => {};
    let rejectPromise: (error: Error) => void = () => {};
    const result = new Promise<ReservoirSurfaceGeometry>((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });

    let worker: SurfaceWorkerLike;
    try {
      worker = this.ensureWorker();
    } catch (error) {
      rejectPromise(error instanceof Error ? error : new SurfaceWorkerInitializationError(error));
      return { requestId, result };
    }

    this.pending.set(requestId, {
      generation: this.generation,
      resolve: resolvePromise,
      reject: rejectPromise,
      ...(onProgress ? { onProgress } : {})
    });
    worker.postMessage({
      type: "request",
      schemaVersion: surfaceWorkerSchemaVersion,
      requestId,
      operation: "extract-surface",
      input,
      options
    }, collectSurfaceInputTransferables(input));
    return { requestId, result };
  }

  public cancel(requestId: string): void {
    const pending = this.pending.get(requestId);
    if (!pending) {
      return;
    }

    this.worker?.postMessage({
      type: "cancel",
      schemaVersion: surfaceWorkerSchemaVersion,
      requestId,
      operation: "cancel-extraction"
    }, []);
    pending.reject(new SurfaceWorkerCancelledError());
    this.pending.delete(requestId);
    this.restart();
  }

  public restart(): void {
    this.worker?.terminate();
    this.worker = undefined;
    this.generation += 1;
    for (const pending of this.pending.values()) {
      pending.reject(new SurfaceWorkerCancelledError());
    }
    this.pending.clear();
  }

  public terminate(): void {
    this.restart();
  }

  private ensureWorker(): SurfaceWorkerLike {
    if (this.worker) {
      return this.worker;
    }

    try {
      const worker = this.workerFactory();
      const workerGeneration = this.generation;
      worker.onmessage = (event) => this.handleMessage(workerGeneration, event.data);
      worker.onerror = (event) => this.handleWorkerError(workerGeneration, event.message);
      this.worker = worker;
      return worker;
    } catch (error) {
      throw new SurfaceWorkerInitializationError(error);
    }
  }

  private handleMessage(workerGeneration: number, message: SurfaceWorkerMessage): void {
    if (workerGeneration !== this.generation || message.schemaVersion !== surfaceWorkerSchemaVersion) {
      return;
    }

    const pending = this.pending.get(message.requestId);
    if (!pending || pending.generation !== workerGeneration) {
      return;
    }

    if (message.type === "progress") {
      pending.onProgress?.(message.progress);
      return;
    }

    this.pending.delete(message.requestId);
    if (message.type === "success") {
      pending.resolve(message.result);
    } else if (message.type === "cancelled") {
      pending.reject(new SurfaceWorkerCancelledError());
    } else {
      pending.reject(new SurfaceWorkerRemoteError(message.error.code, message.error.message));
    }
  }

  private handleWorkerError(workerGeneration: number, message: string): void {
    if (workerGeneration !== this.generation) {
      return;
    }

    const error = new SurfaceWorkerRemoteError("worker-runtime-error", message || "Surface extraction worker failed.");
    for (const pending of this.pending.values()) {
      pending.reject(error);
    }
    this.pending.clear();
    this.restart();
  }
}

function createBrowserSurfaceWorker(): SurfaceWorkerLike {
  return new Worker(new URL("./surface-extraction.worker.ts", import.meta.url), { type: "module" });
}