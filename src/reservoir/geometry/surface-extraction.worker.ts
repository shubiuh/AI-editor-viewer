import { extractReservoirSurface } from "./surface-extractor";
import { isSurfaceWorkerRequest, surfaceWorkerSchemaVersion, type SurfaceWorkerMessage } from "./worker-protocol";
import { collectSurfaceGeometryTransferables } from "./worker-transfer";

const workerScope = globalThis as unknown as DedicatedWorkerGlobalScope;
const cancelledRequestIds = new Set<string>();

workerScope.onmessage = (event: MessageEvent<unknown>) => {
  const request = event.data;
  if (!isSurfaceWorkerRequest(request)) {
    return;
  }

  if (request.type === "cancel") {
    cancelledRequestIds.add(request.requestId);
    return;
  }

  if (cancelledRequestIds.has(request.requestId)) {
    workerScope.postMessage(cancelledMessage(request.requestId, emptyStatistics(request.input)));
    return;
  }

  try {
    const outcome = extractReservoirSurface(request.input, {
      ...request.options,
      shouldCancel: () => cancelledRequestIds.has(request.requestId),
      onProgress: (progress) => workerScope.postMessage({
        type: "progress",
        schemaVersion: surfaceWorkerSchemaVersion,
        requestId: request.requestId,
        operation: "extract-surface",
        progress
      } satisfies SurfaceWorkerMessage)
    });

    if (outcome.status === "completed") {
      workerScope.postMessage({
        type: "success",
        schemaVersion: surfaceWorkerSchemaVersion,
        requestId: request.requestId,
        operation: "extract-surface",
        result: outcome.geometry
      } satisfies SurfaceWorkerMessage, collectSurfaceGeometryTransferables(outcome.geometry));
    } else if (outcome.status === "cancelled") {
      workerScope.postMessage(cancelledMessage(request.requestId, outcome.statistics));
    } else {
      workerScope.postMessage({
        type: "error",
        schemaVersion: surfaceWorkerSchemaVersion,
        requestId: request.requestId,
        operation: "extract-surface",
        error: { code: outcome.code, message: outcome.message }
      } satisfies SurfaceWorkerMessage);
    }
  } catch (error) {
    workerScope.postMessage({
      type: "error",
      schemaVersion: surfaceWorkerSchemaVersion,
      requestId: request.requestId,
      operation: "extract-surface",
      error: {
        code: "surface-extraction-failed",
        message: error instanceof Error ? error.message : "Surface extraction worker failed."
      }
    } satisfies SurfaceWorkerMessage);
  } finally {
    cancelledRequestIds.delete(request.requestId);
  }
};

function cancelledMessage(requestId: string, statistics: ReturnType<typeof emptyStatistics>): SurfaceWorkerMessage {
  return {
    type: "cancelled",
    schemaVersion: surfaceWorkerSchemaVersion,
    requestId,
    operation: "extract-surface",
    statistics
  };
}

function emptyStatistics(input: Parameters<typeof extractReservoirSurface>[0]) {
  const dimensions = input.kind === "corner-point" ? input.geometry.dimensions : input.dimensions;
  return {
    totalCellCount: dimensions.totalCellCount,
    activeCellCount: 0,
    candidateFaceCount: 0,
    emittedFaceCount: 0,
    exteriorFaceCount: 0,
    inactiveNeighborBoundaryFaceCount: 0,
    faultDiscontinuityFaceCount: 0,
    skippedContinuousFaceCount: 0,
    skippedDegenerateFaceCount: 0
  };
}