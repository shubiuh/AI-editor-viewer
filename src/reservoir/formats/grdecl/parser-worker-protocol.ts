import type { GrdeclParseResult } from "./parser";
import type { GrdeclLocation } from "./types";

export const grdeclParserWorkerSchemaVersion = "1.0.0" as const;

export interface GrdeclParserStartRequest {
  readonly type: "start";
  readonly schemaVersion: typeof grdeclParserWorkerSchemaVersion;
  readonly requestId: string;
}

export interface GrdeclParserChunkRequest {
  readonly type: "chunk";
  readonly schemaVersion: typeof grdeclParserWorkerSchemaVersion;
  readonly requestId: string;
  readonly sequence: number;
  readonly data: ArrayBuffer;
  readonly loadedBytes: number;
  readonly totalBytes: number;
}

export interface GrdeclParserFinishRequest {
  readonly type: "finish";
  readonly schemaVersion: typeof grdeclParserWorkerSchemaVersion;
  readonly requestId: string;
}

export interface GrdeclParserCancelRequest {
  readonly type: "cancel";
  readonly schemaVersion: typeof grdeclParserWorkerSchemaVersion;
  readonly requestId: string;
}

export type GrdeclParserWorkerRequest =
  | GrdeclParserStartRequest
  | GrdeclParserChunkRequest
  | GrdeclParserFinishRequest
  | GrdeclParserCancelRequest;

export interface GrdeclParserProgressMessage {
  readonly type: "progress";
  readonly schemaVersion: typeof grdeclParserWorkerSchemaVersion;
  readonly requestId: string;
  readonly phase: "parsing";
  readonly loadedBytes: number;
  readonly totalBytes: number;
  readonly fraction: number;
}

export interface GrdeclParserChunkCompleteMessage {
  readonly type: "chunk-complete";
  readonly schemaVersion: typeof grdeclParserWorkerSchemaVersion;
  readonly requestId: string;
  readonly sequence: number;
}

export interface GrdeclParserSuccessMessage {
  readonly type: "success";
  readonly schemaVersion: typeof grdeclParserWorkerSchemaVersion;
  readonly requestId: string;
  readonly result: GrdeclParseResult;
}

export interface GrdeclParserCancelledMessage {
  readonly type: "cancelled";
  readonly schemaVersion: typeof grdeclParserWorkerSchemaVersion;
  readonly requestId: string;
}

export interface GrdeclParserErrorMessage {
  readonly type: "error";
  readonly schemaVersion: typeof grdeclParserWorkerSchemaVersion;
  readonly requestId: string;
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly location?: GrdeclLocation;
    readonly keyword?: string;
  };
}

export type GrdeclParserWorkerMessage =
  | GrdeclParserProgressMessage
  | GrdeclParserChunkCompleteMessage
  | GrdeclParserSuccessMessage
  | GrdeclParserCancelledMessage
  | GrdeclParserErrorMessage;

export function isGrdeclParserWorkerRequest(value: unknown): value is GrdeclParserWorkerRequest {
  if (!isRecord(value)
    || value.schemaVersion !== grdeclParserWorkerSchemaVersion
    || typeof value.requestId !== "string"
    || !value.requestId
    || typeof value.type !== "string") {
    return false;
  }
  return value.type === "start" || value.type === "finish" || value.type === "cancel"
    || value.type === "chunk"
      && typeof value.sequence === "number"
      && value.data instanceof ArrayBuffer
      && typeof value.loadedBytes === "number"
      && typeof value.totalBytes === "number";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}