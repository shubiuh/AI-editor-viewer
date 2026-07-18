import type { OriginalCellIds } from "../domain/types";
import type { ReservoirSurfaceGeometry, StructuredSurfaceInput } from "./types";

export function collectSurfaceInputTransferables(input: StructuredSurfaceInput): Transferable[] {
  if (input.kind === "corner-point") {
    return collectOwnedBuffers([
      input.geometry.pillarCoordinates,
      input.geometry.cornerDepths,
      input.geometry.activityMask,
      input.geometry.originalCellIds
    ]);
  }

  return collectOwnedBuffers([
    input.cellCorners,
    input.activityMask,
    input.originalCellIds
  ]);
}

export function collectSurfaceGeometryTransferables(geometry: ReservoirSurfaceGeometry): Transferable[] {
  return collectOwnedBuffers([
    geometry.pointCoordinates,
    geometry.polygonConnectivity,
    geometry.polygonOffsets,
    geometry.faceOriginalCellIds,
    geometry.faceLocalIndices,
    geometry.faceIJK,
    geometry.neighborCellIds,
    geometry.faceCategories,
    geometry.modelBounds
  ]);
}

function collectOwnedBuffers(views: readonly (ArrayBufferView | OriginalCellIds | undefined)[]): Transferable[] {
  const buffers = new Set<ArrayBuffer>();
  for (const view of views) {
    if (!view) {
      continue;
    }

    const buffer = view.buffer;
    if (buffer instanceof ArrayBuffer && view.byteOffset === 0 && view.byteLength === buffer.byteLength) {
      buffers.add(buffer);
    }
  }
  return [...buffers];
}