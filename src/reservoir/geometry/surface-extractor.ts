import type { OriginalCellIds } from "../domain/types";
import { cellIJK, createSurfaceCellSource, neighborCellId, type SurfaceCellSource } from "./corner-source";
import { faceCategories, type FaceCategory, type GeometryStatistics, type ReservoirSurfaceGeometry, type StructuredSurfaceInput, type SurfaceExtractionControl, type SurfaceExtractionOutcome } from "./types";

const faceCornerIndices: readonly (readonly [number, number, number, number])[] = [
  [0, 4, 7, 3],
  [1, 2, 6, 5],
  [0, 1, 5, 4],
  [3, 7, 6, 2],
  [0, 3, 2, 1],
  [4, 5, 6, 7]
];

export const defaultContinuityTolerance = 1e-8;
export const defaultDegenerateAreaTolerance = 1e-12;

export interface SurfaceExtractionOptions extends SurfaceExtractionControl {
  readonly continuityTolerance?: number;
  readonly degenerateAreaTolerance?: number;
}

interface FaceDecision {
  readonly category: FaceCategory;
  readonly neighborCellId: number;
}

export function extractReservoirSurface(
  input: StructuredSurfaceInput,
  options: SurfaceExtractionOptions = {}
): SurfaceExtractionOutcome {
  const source = createSurfaceCellSource(input);
  if (!source) {
    return { status: "invalid-input", code: "invalid-structured-surface-input", message: "Structured surface input has inconsistent dimensions or typed-array lengths." };
  }

  const continuityTolerance = options.continuityTolerance ?? defaultContinuityTolerance;
  const degenerateAreaTolerance = options.degenerateAreaTolerance ?? defaultDegenerateAreaTolerance;
  if (!Number.isFinite(continuityTolerance) || continuityTolerance < 0
    || !Number.isFinite(degenerateAreaTolerance) || degenerateAreaTolerance < 0) {
    return { status: "invalid-input", code: "invalid-tolerance", message: "Surface extraction tolerances must be finite and non-negative." };
  }

  const statistics = createStatistics(source.dimensions.totalCellCount);
  if (isCancelled(options)) {
    return { status: "cancelled", statistics };
  }

  const bounds = createEmptyBounds();
  const classification = classifyFaces(source, statistics, bounds, continuityTolerance, degenerateAreaTolerance, options);
  if (classification === "cancelled") {
    return { status: "cancelled", statistics };
  }

  const geometry = allocateGeometry(source.originalCellIds, statistics.emittedFaceCount, bounds, statistics);
  const emission = emitFaces(source, geometry, continuityTolerance, degenerateAreaTolerance, options);
  if (emission === "cancelled") {
    return { status: "cancelled", statistics };
  }

  reportProgress(options, "emit", source.dimensions.totalCellCount, source.dimensions.totalCellCount);
  return { status: "completed", geometry };
}

function classifyFaces(
  source: SurfaceCellSource,
  statistics: MutableStatistics,
  bounds: Float64Array,
  continuityTolerance: number,
  degenerateAreaTolerance: number,
  options: SurfaceExtractionOptions
): "completed" | "cancelled" {
  const corners = new Float64Array(24);
  const neighborCorners = new Float64Array(24);
  const totalCellCount = source.dimensions.totalCellCount;

  reportProgress(options, "classify", 0, totalCellCount);
  for (let cellId = 0; cellId < totalCellCount; cellId += 1) {
    if (isCancelled(options)) {
      return "cancelled";
    }

    if (!source.getActivity(cellId)) {
      reportProgressIfNeeded(options, "classify", cellId + 1, totalCellCount);
      continue;
    }

    statistics.activeCellCount += 1;
    source.populateCorners(cellId, corners);
    updateBounds(bounds, corners);

    for (let localFaceIndex = 0; localFaceIndex < 6; localFaceIndex += 1) {
      statistics.candidateFaceCount += 1;
      if (isDegenerateFace(corners, localFaceIndex, degenerateAreaTolerance)) {
        statistics.skippedDegenerateFaceCount += 1;
        continue;
      }

      const decision = classifyFace(source, cellId, localFaceIndex, corners, neighborCorners, continuityTolerance);
      if (!decision) {
        statistics.skippedContinuousFaceCount += 1;
        continue;
      }

      incrementEmittedFaceStatistics(statistics, decision.category);
    }

    reportProgressIfNeeded(options, "classify", cellId + 1, totalCellCount);
  }

  return "completed";
}

function emitFaces(
  source: SurfaceCellSource,
  geometry: MutableSurfaceGeometry,
  continuityTolerance: number,
  degenerateAreaTolerance: number,
  options: SurfaceExtractionOptions
): "completed" | "cancelled" {
  const corners = new Float64Array(24);
  const neighborCorners = new Float64Array(24);
  const totalCellCount = source.dimensions.totalCellCount;
  let faceIndex = 0;
  reportProgress(options, "emit", 0, totalCellCount);

  for (let cellId = 0; cellId < totalCellCount; cellId += 1) {
    if (isCancelled(options)) {
      return "cancelled";
    }

    if (!source.getActivity(cellId)) {
      reportProgressIfNeeded(options, "emit", cellId + 1, totalCellCount);
      continue;
    }

    source.populateCorners(cellId, corners);
    for (let localFaceIndex = 0; localFaceIndex < 6; localFaceIndex += 1) {
      if (isDegenerateFace(corners, localFaceIndex, degenerateAreaTolerance)) {
        continue;
      }

      const decision = classifyFace(source, cellId, localFaceIndex, corners, neighborCorners, continuityTolerance);
      if (!decision) {
        continue;
      }

      writeFace(geometry, faceIndex, source, cellId, localFaceIndex, corners, decision);
      faceIndex += 1;
    }

    reportProgressIfNeeded(options, "emit", cellId + 1, totalCellCount);
  }

  return "completed";
}

function classifyFace(
  source: SurfaceCellSource,
  cellId: number,
  localFaceIndex: number,
  corners: Float64Array,
  neighborCorners: Float64Array,
  tolerance: number
): FaceDecision | undefined {
  const neighborId = neighborCellId(cellId, localFaceIndex, source.dimensions);
  if (neighborId < 0) {
    return { category: faceCategories.exterior, neighborCellId: -1 };
  }

  if (!source.getActivity(neighborId)) {
    return { category: faceCategories.inactiveNeighborBoundary, neighborCellId: neighborId };
  }

  source.populateCorners(neighborId, neighborCorners);
  if (faceCornersMatch(corners, localFaceIndex, neighborCorners, oppositeFaceIndex(localFaceIndex), tolerance)) {
    return undefined;
  }

  return { category: faceCategories.faultDiscontinuity, neighborCellId: neighborId };
}

function writeFace(
  geometry: MutableSurfaceGeometry,
  faceIndex: number,
  source: SurfaceCellSource,
  cellId: number,
  localFaceIndex: number,
  corners: Float64Array,
  decision: FaceDecision
): void {
  const pointOffset = faceIndex * 12;
  const connectivityOffset = faceIndex * 4;
  for (let vertex = 0; vertex < 4; vertex += 1) {
    const cornerIndex = faceCornerIndices[localFaceIndex]?.[vertex] ?? 0;
    const sourceOffset = cornerIndex * 3;
    const destinationOffset = pointOffset + vertex * 3;
    geometry.pointCoordinates[destinationOffset] = corners[sourceOffset] ?? Number.NaN;
    geometry.pointCoordinates[destinationOffset + 1] = corners[sourceOffset + 1] ?? Number.NaN;
    geometry.pointCoordinates[destinationOffset + 2] = corners[sourceOffset + 2] ?? Number.NaN;
    geometry.polygonConnectivity[connectivityOffset + vertex] = connectivityOffset + vertex;
  }

  geometry.polygonOffsets[faceIndex] = connectivityOffset;
  geometry.faceLocalIndices[faceIndex] = localFaceIndex;
  geometry.neighborCellIds[faceIndex] = decision.neighborCellId;
  geometry.faceCategories[faceIndex] = decision.category;
  const [i, j, k] = cellIJK(cellId, source.dimensions);
  geometry.faceIJK.set([i, j, k], faceIndex * 3);
  writeOriginalCellId(geometry.faceOriginalCellIds, faceIndex, source.originalCellIds, cellId);
}

function faceCornersMatch(
  firstCorners: Float64Array,
  firstFaceIndex: number,
  secondCorners: Float64Array,
  secondFaceIndex: number,
  tolerance: number
): boolean {
  const matched = new Uint8Array(4);
  for (let firstVertex = 0; firstVertex < 4; firstVertex += 1) {
    const firstCorner = faceCornerIndices[firstFaceIndex]?.[firstVertex] ?? 0;
    let foundMatch = false;
    for (let secondVertex = 0; secondVertex < 4; secondVertex += 1) {
      if (matched[secondVertex] !== 0) {
        continue;
      }
      const secondCorner = faceCornerIndices[secondFaceIndex]?.[secondVertex] ?? 0;
      if (pointsWithinTolerance(firstCorners, firstCorner, secondCorners, secondCorner, tolerance)) {
        matched[secondVertex] = 1;
        foundMatch = true;
        break;
      }
    }
    if (!foundMatch) {
      return false;
    }
  }
  return true;
}

function isDegenerateFace(corners: Float64Array, faceIndex: number, areaTolerance: number): boolean {
  const indices = faceCornerIndices[faceIndex] ?? faceCornerIndices[0]!;
  const area = triangleArea(corners, indices[0], indices[1], indices[2])
    + triangleArea(corners, indices[0], indices[2], indices[3]);
  return !Number.isFinite(area) || area <= areaTolerance;
}

function triangleArea(corners: Float64Array, first: number, second: number, third: number): number {
  const firstOffset = first * 3;
  const secondOffset = second * 3;
  const thirdOffset = third * 3;
  const abX = (corners[secondOffset] ?? Number.NaN) - (corners[firstOffset] ?? Number.NaN);
  const abY = (corners[secondOffset + 1] ?? Number.NaN) - (corners[firstOffset + 1] ?? Number.NaN);
  const abZ = (corners[secondOffset + 2] ?? Number.NaN) - (corners[firstOffset + 2] ?? Number.NaN);
  const acX = (corners[thirdOffset] ?? Number.NaN) - (corners[firstOffset] ?? Number.NaN);
  const acY = (corners[thirdOffset + 1] ?? Number.NaN) - (corners[firstOffset + 1] ?? Number.NaN);
  const acZ = (corners[thirdOffset + 2] ?? Number.NaN) - (corners[firstOffset + 2] ?? Number.NaN);
  const crossX = abY * acZ - abZ * acY;
  const crossY = abZ * acX - abX * acZ;
  const crossZ = abX * acY - abY * acX;
  return 0.5 * Math.hypot(crossX, crossY, crossZ);
}

function pointsWithinTolerance(
  firstCorners: Float64Array,
  firstCorner: number,
  secondCorners: Float64Array,
  secondCorner: number,
  tolerance: number
): boolean {
  const firstOffset = firstCorner * 3;
  const secondOffset = secondCorner * 3;
  return Math.abs((firstCorners[firstOffset] ?? Number.NaN) - (secondCorners[secondOffset] ?? Number.NaN)) <= tolerance
    && Math.abs((firstCorners[firstOffset + 1] ?? Number.NaN) - (secondCorners[secondOffset + 1] ?? Number.NaN)) <= tolerance
    && Math.abs((firstCorners[firstOffset + 2] ?? Number.NaN) - (secondCorners[secondOffset + 2] ?? Number.NaN)) <= tolerance;
}

function oppositeFaceIndex(localFaceIndex: number): number {
  return localFaceIndex % 2 === 0 ? localFaceIndex + 1 : localFaceIndex - 1;
}

function createEmptyBounds(): Float64Array {
  return new Float64Array([Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity]);
}

function updateBounds(bounds: Float64Array, corners: Float64Array): void {
  for (let cornerIndex = 0; cornerIndex < 8; cornerIndex += 1) {
    const offset = cornerIndex * 3;
    const x = corners[offset] ?? Number.NaN;
    const y = corners[offset + 1] ?? Number.NaN;
    const z = corners[offset + 2] ?? Number.NaN;
    bounds[0] = Math.min(bounds[0] ?? Infinity, x);
    bounds[1] = Math.max(bounds[1] ?? -Infinity, x);
    bounds[2] = Math.min(bounds[2] ?? Infinity, y);
    bounds[3] = Math.max(bounds[3] ?? -Infinity, y);
    bounds[4] = Math.min(bounds[4] ?? Infinity, z);
    bounds[5] = Math.max(bounds[5] ?? -Infinity, z);
  }
}

interface MutableStatistics extends GeometryStatistics {
  activeCellCount: number;
  candidateFaceCount: number;
  emittedFaceCount: number;
  exteriorFaceCount: number;
  inactiveNeighborBoundaryFaceCount: number;
  faultDiscontinuityFaceCount: number;
  skippedContinuousFaceCount: number;
  skippedDegenerateFaceCount: number;
}

function createStatistics(totalCellCount: number): MutableStatistics {
  return {
    totalCellCount,
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

function incrementEmittedFaceStatistics(statistics: MutableStatistics, category: FaceCategory): void {
  statistics.emittedFaceCount += 1;
  if (category === faceCategories.exterior) {
    statistics.exteriorFaceCount += 1;
  } else if (category === faceCategories.inactiveNeighborBoundary) {
    statistics.inactiveNeighborBoundaryFaceCount += 1;
  } else {
    statistics.faultDiscontinuityFaceCount += 1;
  }
}

interface MutableSurfaceGeometry extends ReservoirSurfaceGeometry {
  readonly pointCoordinates: Float64Array;
  readonly polygonConnectivity: Uint32Array;
  readonly polygonOffsets: Uint32Array;
  readonly faceOriginalCellIds: OriginalCellIds;
  readonly faceLocalIndices: Uint8Array;
  readonly faceIJK: Uint32Array;
  readonly neighborCellIds: Int32Array;
  readonly faceCategories: Uint8Array;
  readonly modelBounds: Float64Array;
  readonly statistics: MutableStatistics;
}

function allocateGeometry(
  originalCellIds: OriginalCellIds,
  faceCount: number,
  bounds: Float64Array,
  statistics: MutableStatistics
): MutableSurfaceGeometry {
  const faceOriginalCellIds = originalCellIds instanceof BigUint64Array
    ? new BigUint64Array(faceCount)
    : new Uint32Array(faceCount);
  const polygonOffsets = new Uint32Array(faceCount + 1);
  polygonOffsets[faceCount] = faceCount * 4;
  return {
    pointCoordinates: new Float64Array(faceCount * 12),
    polygonConnectivity: new Uint32Array(faceCount * 4),
    polygonOffsets,
    faceOriginalCellIds,
    faceLocalIndices: new Uint8Array(faceCount),
    faceIJK: new Uint32Array(faceCount * 3),
    neighborCellIds: new Int32Array(faceCount),
    faceCategories: new Uint8Array(faceCount),
    modelBounds: bounds,
    statistics
  };
}

function writeOriginalCellId(
  target: OriginalCellIds,
  targetIndex: number,
  source: OriginalCellIds,
  sourceIndex: number
): void {
  if (target instanceof BigUint64Array && source instanceof BigUint64Array) {
    target[targetIndex] = source[sourceIndex] ?? 0n;
  } else if (target instanceof Uint32Array && source instanceof Uint32Array) {
    target[targetIndex] = source[sourceIndex] ?? 0;
  } else if (target instanceof BigUint64Array) {
    target[targetIndex] = BigInt(source[sourceIndex] ?? 0);
  } else {
    target[targetIndex] = Number(source[sourceIndex] ?? 0n);
  }
}

function isCancelled(options: SurfaceExtractionOptions): boolean {
  return options.signal?.aborted === true || options.shouldCancel?.() === true;
}

function reportProgressIfNeeded(
  options: SurfaceExtractionOptions,
  phase: "classify" | "emit",
  completedCellCount: number,
  totalCellCount: number
): void {
  const interval = options.progressIntervalCells ?? 256;
  if (completedCellCount === totalCellCount || completedCellCount % interval === 0) {
    reportProgress(options, phase, completedCellCount, totalCellCount);
  }
}

function reportProgress(
  options: SurfaceExtractionOptions,
  phase: "classify" | "emit",
  completedCellCount: number,
  totalCellCount: number
): void {
  options.onProgress?.({ phase, completedCellCount, totalCellCount, fraction: completedCellCount / totalCellCount });
}