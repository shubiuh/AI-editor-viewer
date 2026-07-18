import { err, ok, type Result } from "../../domain/result";
import type {
  CornerPointGridGeometry,
  ExplicitCellGeometry,
  ReservoirGrid,
  StructuredGridDimensions
} from "./types";

export interface ReservoirValidationError {
  readonly code: string;
  readonly message: string;
}

export function validateStructuredGridDimensions(
  dimensions: StructuredGridDimensions
): Result<StructuredGridDimensions, ReservoirValidationError> {
  if (![dimensions.nx, dimensions.ny, dimensions.nz].every(isPositiveSafeInteger)) {
    return invalid("invalid-grid-dimensions", "Grid dimensions must be positive safe integers.");
  }

  const expectedTotal = dimensions.nx * dimensions.ny * dimensions.nz;
  if (!Number.isSafeInteger(expectedTotal) || dimensions.totalCellCount !== expectedTotal) {
    return invalid("invalid-total-cell-count", "totalCellCount must equal nx * ny * nz.");
  }

  return ok(dimensions);
}

export function validateCornerPointGridGeometry(
  geometry: CornerPointGridGeometry
): Result<CornerPointGridGeometry, ReservoirValidationError> {
  const dimensions = validateStructuredGridDimensions(geometry.dimensions);
  if (!dimensions.ok) {
    return dimensions;
  }

  const pillarCount = (geometry.dimensions.nx + 1) * (geometry.dimensions.ny + 1);
  if (geometry.pillarCoordinates.length !== pillarCount * 6) {
    return invalid("invalid-pillar-length", "Pillar coordinates must contain six values per pillar.");
  }

  if (geometry.cornerDepths.length !== geometry.dimensions.totalCellCount * 8) {
    return invalid("invalid-corner-depth-length", "Corner depths must contain eight values per cell.");
  }

  if (!hasFiniteValues(geometry.pillarCoordinates) || !hasFiniteValues(geometry.cornerDepths)) {
    return invalid("non-finite-geometry", "Corner-point geometry must contain finite coordinates and depths.");
  }

  if (geometry.activityMask && geometry.activityMask.length !== geometry.dimensions.totalCellCount) {
    return invalid("invalid-activity-mask-length", "Activity mask length must match totalCellCount.");
  }

  if (geometry.originalCellIds.length !== geometry.dimensions.totalCellCount) {
    return invalid("invalid-original-cell-id-length", "Original cell IDs must match totalCellCount.");
  }

  return ok(geometry);
}

export function validateExplicitCellGeometry(
  geometry: ExplicitCellGeometry
): Result<ExplicitCellGeometry, ReservoirValidationError> {
  if (geometry.pointCoordinates.length === 0 || geometry.pointCoordinates.length % 3 !== 0) {
    return invalid("invalid-point-coordinate-length", "Point coordinates must contain xyz triples.");
  }

  if (!hasFiniteValues(geometry.pointCoordinates)) {
    return invalid("non-finite-point-coordinate", "Point coordinates must be finite.");
  }

  if (geometry.cellOffsets.length < 2 || geometry.cellOffsets.length !== geometry.cellTypes.length + 1) {
    return invalid("invalid-cell-offset-length", "Cell offsets must have one more entry than cell types.");
  }

  if (readOffset(geometry.cellOffsets, 0) !== 0) {
    return invalid("invalid-cell-offset-start", "The first cell offset must be zero.");
  }

  for (let index = 1; index < geometry.cellOffsets.length; index += 1) {
    const previous = readOffset(geometry.cellOffsets, index - 1);
    const current = readOffset(geometry.cellOffsets, index);
    if (current < previous || current > geometry.connectivity.length) {
      return invalid("invalid-cell-offset", "Cell offsets must be monotonic and within connectivity bounds.");
    }
  }

  if (readOffset(geometry.cellOffsets, geometry.cellOffsets.length - 1) !== geometry.connectivity.length) {
    return invalid("invalid-connectivity-length", "The final cell offset must equal connectivity length.");
  }

  if (geometry.originalCellIds.length !== geometry.cellTypes.length) {
    return invalid("invalid-original-cell-id-length", "Original cell IDs must match the cell count.");
  }

  return ok(geometry);
}

export function validateReservoirGrid(grid: ReservoirGrid): Result<ReservoirGrid, ReservoirValidationError> {
  if (!grid.gridId.trim() || !grid.displayName.trim()) {
    return invalid("invalid-grid-metadata", "Grid ID and display name must be non-empty.");
  }

  const geometry = grid.kind === "corner-point"
    ? validateCornerPointGridGeometry(grid.geometry)
    : validateExplicitCellGeometry(grid.geometry);

  if (!geometry.ok) {
    return geometry;
  }

  return ok(grid);
}

function isPositiveSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function hasFiniteValues(values: ArrayLike<number>): boolean {
  for (let index = 0; index < values.length; index += 1) {
    if (!Number.isFinite(values[index])) {
      return false;
    }
  }

  return true;
}

function readOffset(offsets: Uint32Array, index: number): number {
  return offsets[index] ?? Number.NaN;
}

function invalid(code: string, message: string): Result<never, ReservoirValidationError> {
  return err({ code, message });
}