import type { GeometryStatistics, ReservoirSurfaceGeometry, StructuredSurfaceInput, SurfaceExtractionProgress } from "./types";

export const surfaceWorkerSchemaVersion = 1 as const;

export interface SurfaceWorkerExtractionOptions {
  readonly continuityTolerance?: number;
  readonly degenerateAreaTolerance?: number;
  readonly progressIntervalCells?: number;
}

export interface ExtractSurfaceWorkerRequest {
  readonly type: "request";
  readonly schemaVersion: typeof surfaceWorkerSchemaVersion;
  readonly requestId: string;
  readonly operation: "extract-surface";
  readonly input: StructuredSurfaceInput;
  readonly options: SurfaceWorkerExtractionOptions;
}

export interface CancelSurfaceWorkerRequest {
  readonly type: "cancel";
  readonly schemaVersion: typeof surfaceWorkerSchemaVersion;
  readonly requestId: string;
  readonly operation: "cancel-extraction";
}

export type SurfaceWorkerRequest = ExtractSurfaceWorkerRequest | CancelSurfaceWorkerRequest;

export interface SurfaceWorkerProgressMessage {
  readonly type: "progress";
  readonly schemaVersion: typeof surfaceWorkerSchemaVersion;
  readonly requestId: string;
  readonly operation: "extract-surface";
  readonly progress: SurfaceExtractionProgress;
}

export interface SurfaceWorkerSuccessMessage {
  readonly type: "success";
  readonly schemaVersion: typeof surfaceWorkerSchemaVersion;
  readonly requestId: string;
  readonly operation: "extract-surface";
  readonly result: ReservoirSurfaceGeometry;
}

export interface SurfaceWorkerCancelledMessage {
  readonly type: "cancelled";
  readonly schemaVersion: typeof surfaceWorkerSchemaVersion;
  readonly requestId: string;
  readonly operation: "extract-surface";
  readonly statistics: GeometryStatistics;
}

export interface SurfaceWorkerErrorMessage {
  readonly type: "error";
  readonly schemaVersion: typeof surfaceWorkerSchemaVersion;
  readonly requestId: string;
  readonly operation: "extract-surface";
  readonly error: {
    readonly code: string;
    readonly message: string;
  };
}

export type SurfaceWorkerMessage =
  | SurfaceWorkerProgressMessage
  | SurfaceWorkerSuccessMessage
  | SurfaceWorkerCancelledMessage
  | SurfaceWorkerErrorMessage;

export function isSurfaceWorkerRequest(value: unknown): value is SurfaceWorkerRequest {
  if (!isRecord(value)
    || value.schemaVersion !== surfaceWorkerSchemaVersion
    || typeof value.requestId !== "string"
    || !value.requestId) {
    return false;
  }

  return value.type === "request" && value.operation === "extract-surface"
    || value.type === "cancel" && value.operation === "cancel-extraction";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}