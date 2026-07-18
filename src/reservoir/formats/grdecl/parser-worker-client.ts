import type { GrdeclParseResult } from "./parser";
import {
  grdeclParserWorkerSchemaVersion,
  type GrdeclParserWorkerMessage,
  type GrdeclParserWorkerRequest
} from "./parser-worker-protocol";

export interface GrdeclParserWorkerLike {
  onmessage: ((event: MessageEvent<GrdeclParserWorkerMessage>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: GrdeclParserWorkerRequest, transfer?: Transferable[]): void;
  terminate(): void;
}

export interface GrdeclParserWorkerTask {
  readonly requestId: string;
  write(data: ArrayBuffer, loadedBytes: number, totalBytes: number): Promise<void>;
  finish(): Promise<GrdeclParseResult>;
}

export class GrdeclParserWorkerCancelledError extends Error {
  public constructor() {
    super("GRDECL parsing was cancelled.");
    this.name = "GrdeclParserWorkerCancelledError";
  }
}

export class GrdeclParserWorkerRemoteError extends Error {
  public readonly code: string;
  public readonly location: { readonly line: number; readonly column: number; readonly offset: number } | undefined;
  public readonly keyword: string | undefined;

  public constructor(error: Extract<GrdeclParserWorkerMessage, { readonly type: "error" }> ["error"]) {
    super(error.message);
    this.name = "GrdeclParserWorkerRemoteError";
    this.code = error.code;
    this.location = error.location;
    this.keyword = error.keyword;
  }
}

export class GrdeclParserWorkerClient {
  private readonly worker: GrdeclParserWorkerLike;
  private sequence = 0;
  private task: PendingTask | undefined;

  public constructor(workerFactory: () => GrdeclParserWorkerLike = createBrowserParserWorker) {
    this.worker = workerFactory();
    this.worker.onmessage = (event) => this.handleMessage(event.data);
    this.worker.onerror = (event) => this.fail(new Error(event.message || "GRDECL parser worker failed."));
  }

  public start(onProgress?: (fraction: number) => void): GrdeclParserWorkerTask {
    this.cancel();
    const requestId = `grdecl-${++this.sequence}`;
    let resolveResult: (result: GrdeclParseResult) => void = () => {};
    let rejectResult: (error: Error) => void = () => {};
    const result = new Promise<GrdeclParseResult>((resolve, reject) => {
      resolveResult = resolve;
      rejectResult = reject;
    });
    void result.catch(() => {});
    this.task = { requestId, sequence: 0, writeResolve: undefined, writeReject: undefined, resolveResult, rejectResult, result, onProgress };
    this.worker.postMessage({ type: "start", schemaVersion: grdeclParserWorkerSchemaVersion, requestId });
    return {
      requestId,
      write: (data, loadedBytes, totalBytes) => this.write(requestId, data, loadedBytes, totalBytes),
      finish: () => this.finish(requestId)
    };
  }

  public cancel(): void {
    const task = this.task;
    if (!task) {
      return;
    }
    this.worker.postMessage({ type: "cancel", schemaVersion: grdeclParserWorkerSchemaVersion, requestId: task.requestId });
    const error = new GrdeclParserWorkerCancelledError();
    task.writeReject?.(error);
    task.rejectResult(error);
    this.task = undefined;
  }

  public terminate(): void {
    this.cancel();
    this.worker.terminate();
  }

  private write(requestId: string, data: ArrayBuffer, loadedBytes: number, totalBytes: number): Promise<void> {
    const task = this.requireTask(requestId);
    if (task.writeResolve) {
      return Promise.reject(new Error("A GRDECL chunk is already being parsed."));
    }
    const sequence = ++task.sequence;
    return new Promise<void>((resolve, reject) => {
      task.writeResolve = resolve;
      task.writeReject = reject;
      this.worker.postMessage({ type: "chunk", schemaVersion: grdeclParserWorkerSchemaVersion, requestId, sequence, data, loadedBytes, totalBytes }, [data]);
    });
  }

  private finish(requestId: string): Promise<GrdeclParseResult> {
    const task = this.requireTask(requestId);
    if (task.writeResolve) {
      return Promise.reject(new Error("Wait for the current GRDECL chunk before finishing."));
    }
    this.worker.postMessage({ type: "finish", schemaVersion: grdeclParserWorkerSchemaVersion, requestId });
    return task.result;
  }

  private handleMessage(message: GrdeclParserWorkerMessage): void {
    const task = this.task;
    if (!task || message.schemaVersion !== grdeclParserWorkerSchemaVersion || message.requestId !== task.requestId) {
      return;
    }
    if (message.type === "progress") {
      task.onProgress?.(message.fraction);
      return;
    }
    if (message.type === "chunk-complete") {
      task.writeResolve?.();
      task.writeResolve = undefined;
      task.writeReject = undefined;
      return;
    }
    if (message.type === "success") {
      task.resolveResult(message.result);
      this.task = undefined;
      return;
    }
    if (message.type === "cancelled") {
      this.fail(new GrdeclParserWorkerCancelledError());
      return;
    }
    this.fail(new GrdeclParserWorkerRemoteError(message.error));
  }

  private fail(error: Error): void {
    const task = this.task;
    if (!task) {
      return;
    }
    task.writeReject?.(error);
    task.rejectResult(error);
    this.task = undefined;
  }

  private requireTask(requestId: string): PendingTask {
    if (!this.task || this.task.requestId !== requestId) {
      throw new GrdeclParserWorkerCancelledError();
    }
    return this.task;
  }
}

interface PendingTask {
  readonly requestId: string;
  sequence: number;
  writeResolve: (() => void) | undefined;
  writeReject: ((error: Error) => void) | undefined;
  readonly resolveResult: (result: GrdeclParseResult) => void;
  readonly rejectResult: (error: Error) => void;
  readonly result: Promise<GrdeclParseResult>;
  readonly onProgress: ((fraction: number) => void) | undefined;
}

function createBrowserParserWorker(): GrdeclParserWorkerLike {
  return new Worker(new URL("./parser.worker.ts", import.meta.url), { type: "module" });
}