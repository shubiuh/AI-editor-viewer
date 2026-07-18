import { GrdeclSemanticParser } from "./parser";
import { validateReservoirCase } from "../../domain/case-validation";
import {
  grdeclParserWorkerSchemaVersion,
  isGrdeclParserWorkerRequest,
  type GrdeclParserWorkerMessage
} from "./parser-worker-protocol";
import { GrdeclTokenizer } from "./tokenizer";

const workerScope = globalThis as unknown as DedicatedWorkerGlobalScope;
const sessions = new Map<string, ParserSession>();

workerScope.onmessage = (event: MessageEvent<unknown>) => {
  const request = event.data;
  if (!isGrdeclParserWorkerRequest(request)) {
    return;
  }

  if (request.type === "cancel") {
    sessions.delete(request.requestId);
    workerScope.postMessage({ type: "cancelled", schemaVersion: grdeclParserWorkerSchemaVersion, requestId: request.requestId } satisfies GrdeclParserWorkerMessage);
    return;
  }

  try {
    if (request.type === "start") {
      sessions.set(request.requestId, createSession());
      return;
    }
    const session = sessions.get(request.requestId);
    if (!session) {
      return;
    }
    if (request.type === "chunk") {
      const text = session.decoder.decode(request.data, { stream: true });
      for (const token of session.tokenizer.push(text)) {
        session.parser.consume(token);
      }
      workerScope.postMessage({ type: "chunk-complete", schemaVersion: grdeclParserWorkerSchemaVersion, requestId: request.requestId, sequence: request.sequence } satisfies GrdeclParserWorkerMessage);
      workerScope.postMessage({
        type: "progress",
        schemaVersion: grdeclParserWorkerSchemaVersion,
        requestId: request.requestId,
        phase: "parsing",
        loadedBytes: request.loadedBytes,
        totalBytes: request.totalBytes,
        fraction: request.totalBytes === 0 ? 1 : request.loadedBytes / request.totalBytes
      } satisfies GrdeclParserWorkerMessage);
      return;
    }
    for (const token of session.tokenizer.push(session.decoder.decode())) {
      session.parser.consume(token);
    }
    for (const token of session.tokenizer.finish()) {
      session.parser.consume(token);
    }
    const result = session.parser.finish();
    const validation = validateReservoirCase(result.reservoirCase);
    if (!validation.ok) {
      throw Object.assign(new Error(validation.error.message), { code: validation.error.code });
    }
    sessions.delete(request.requestId);
    workerScope.postMessage({ type: "success", schemaVersion: grdeclParserWorkerSchemaVersion, requestId: request.requestId, result } satisfies GrdeclParserWorkerMessage);
  } catch (error) {
    sessions.delete(request.requestId);
    workerScope.postMessage({
      type: "error",
      schemaVersion: grdeclParserWorkerSchemaVersion,
      requestId: request.requestId,
      error: toErrorPayload(error)
    } satisfies GrdeclParserWorkerMessage);
  }
};

interface ParserSession {
  readonly decoder: TextDecoder;
  readonly parser: GrdeclSemanticParser;
  readonly tokenizer: GrdeclTokenizer;
}

function createSession(): ParserSession {
  return { decoder: new TextDecoder("utf-8", { fatal: true }), parser: new GrdeclSemanticParser(), tokenizer: new GrdeclTokenizer() };
}

function toErrorPayload(error: unknown) {
  if (error instanceof Error) {
    const record = error as Error & { code?: unknown; location?: unknown; keyword?: unknown };
    return {
      code: typeof record.code === "string" ? record.code : "parser-failed",
      message: error.message,
      ...(isLocation(record.location) ? { location: record.location } : {}),
      ...(typeof record.keyword === "string" ? { keyword: record.keyword } : {})
    };
  }
  return { code: "parser-failed", message: "GRDECL parser worker failed." };
}

function isLocation(value: unknown): value is { readonly line: number; readonly column: number; readonly offset: number } {
  return typeof value === "object" && value !== null
    && typeof (value as { line?: unknown }).line === "number"
    && typeof (value as { column?: unknown }).column === "number"
    && typeof (value as { offset?: unknown }).offset === "number";
}