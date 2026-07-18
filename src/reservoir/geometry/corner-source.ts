import type { CornerPointGridGeometry, OriginalCellIds, StructuredGridDimensions } from "../domain/types";
import type { StructuredSurfaceInput } from "./types";

export interface SurfaceCellSource {
  readonly dimensions: StructuredGridDimensions;
  readonly originalCellIds: OriginalCellIds;
  readonly getActivity: (cellId: number) => boolean;
  readonly populateCorners: (cellId: number, target: Float64Array) => void;
}

export function createSurfaceCellSource(input: StructuredSurfaceInput): SurfaceCellSource | undefined {
  if (!hasValidDimensions(input.kind === "corner-point" ? input.geometry.dimensions : input.dimensions)) {
    return undefined;
  }

  if (input.kind === "corner-point") {
    return createCornerPointSource(input.geometry);
  }

  if (input.cellCorners.length !== input.dimensions.totalCellCount * 24
    || input.originalCellIds.length !== input.dimensions.totalCellCount
    || (input.activityMask && input.activityMask.length !== input.dimensions.totalCellCount)) {
    return undefined;
  }

  return {
    dimensions: input.dimensions,
    originalCellIds: input.originalCellIds,
    getActivity: (cellId) => input.activityMask?.[cellId] !== 0,
    populateCorners: (cellId, target) => target.set(input.cellCorners.subarray(cellId * 24, cellId * 24 + 24))
  };
}

export function cellIJK(cellId: number, dimensions: StructuredGridDimensions): readonly [number, number, number] {
  const i = cellId % dimensions.nx;
  const remainder = Math.floor(cellId / dimensions.nx);
  const j = remainder % dimensions.ny;
  const k = Math.floor(remainder / dimensions.ny);
  return [i, j, k];
}

export function neighborCellId(
  cellId: number,
  localFaceIndex: number,
  dimensions: StructuredGridDimensions
): number {
  const [i, j, k] = cellIJK(cellId, dimensions);
  const offsets: readonly [number, number, number] = localFaceIndex === 0 ? [-1, 0, 0]
    : localFaceIndex === 1 ? [1, 0, 0]
      : localFaceIndex === 2 ? [0, -1, 0]
        : localFaceIndex === 3 ? [0, 1, 0]
          : localFaceIndex === 4 ? [0, 0, -1]
            : [0, 0, 1];
  const neighborI = i + offsets[0];
  const neighborJ = j + offsets[1];
  const neighborK = k + offsets[2];

  if (neighborI < 0 || neighborJ < 0 || neighborK < 0
    || neighborI >= dimensions.nx || neighborJ >= dimensions.ny || neighborK >= dimensions.nz) {
    return -1;
  }

  return neighborI + dimensions.nx * (neighborJ + dimensions.ny * neighborK);
}

function createCornerPointSource(geometry: CornerPointGridGeometry): SurfaceCellSource | undefined {
  const { dimensions } = geometry;
  const expectedPillarLength = (dimensions.nx + 1) * (dimensions.ny + 1) * 6;
  if (geometry.pillarCoordinates.length !== expectedPillarLength
    || geometry.cornerDepths.length !== dimensions.totalCellCount * 8
    || geometry.originalCellIds.length !== dimensions.totalCellCount
    || (geometry.activityMask && geometry.activityMask.length !== dimensions.totalCellCount)) {
    return undefined;
  }

  return {
    dimensions,
    originalCellIds: geometry.originalCellIds,
    getActivity: (cellId) => geometry.activityMask?.[cellId] !== 0,
    populateCorners: (cellId, target) => populateCornerPointCell(geometry, cellId, target)
  };
}

function populateCornerPointCell(geometry: CornerPointGridGeometry, cellId: number, target: Float64Array): void {
  const [i, j] = cellIJK(cellId, geometry.dimensions);
  const pillarStride = geometry.dimensions.nx + 1;
  const pillarIndices: readonly [number, number, number, number] = [
    i + pillarStride * j,
    i + 1 + pillarStride * j,
    i + 1 + pillarStride * (j + 1),
    i + pillarStride * (j + 1)
  ];

  for (let cornerIndex = 0; cornerIndex < 8; cornerIndex += 1) {
    const pillarIndex = pillarIndices[cornerIndex % 4] ?? 0;
    const depth = geometry.cornerDepths[cellId * 8 + cornerIndex] ?? Number.NaN;
    interpolatePillarPoint(geometry.pillarCoordinates, pillarIndex, depth, target, cornerIndex * 3);
  }
}

function interpolatePillarPoint(
  pillars: Float64Array,
  pillarIndex: number,
  depth: number,
  target: Float64Array,
  targetOffset: number
): void {
  const offset = pillarIndex * 6;
  const topX = pillars[offset] ?? Number.NaN;
  const topY = pillars[offset + 1] ?? Number.NaN;
  const topZ = pillars[offset + 2] ?? Number.NaN;
  const bottomX = pillars[offset + 3] ?? Number.NaN;
  const bottomY = pillars[offset + 4] ?? Number.NaN;
  const bottomZ = pillars[offset + 5] ?? Number.NaN;
  const denominator = bottomZ - topZ;
  const ratio = denominator === 0 ? 0 : (depth - topZ) / denominator;

  target[targetOffset] = topX + ratio * (bottomX - topX);
  target[targetOffset + 1] = topY + ratio * (bottomY - topY);
  target[targetOffset + 2] = depth;
}

function hasValidDimensions(dimensions: StructuredGridDimensions): boolean {
  return Number.isSafeInteger(dimensions.nx) && dimensions.nx > 0
    && Number.isSafeInteger(dimensions.ny) && dimensions.ny > 0
    && Number.isSafeInteger(dimensions.nz) && dimensions.nz > 0
    && dimensions.totalCellCount === dimensions.nx * dimensions.ny * dimensions.nz;
}