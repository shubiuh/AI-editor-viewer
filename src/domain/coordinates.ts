import { err, ok, type Result } from "./result";

export type Coordinate = readonly [number, number, number];

export interface RebasedCoordinates {
  /** Local origin subtracted before Float32 positions are sent to WebGL. */
  readonly origin: Coordinate;
  readonly positions: Float32Array;
}

export interface CoordinateValidationError {
  readonly code: "invalid-coordinate-count" | "invalid-origin" | "non-finite-coordinate";
  readonly message: string;
}

export function rebaseCoordinates(
  coordinates: ArrayLike<number>,
  origin?: Coordinate
): Result<RebasedCoordinates, CoordinateValidationError> {
  if (coordinates.length === 0 || coordinates.length % 3 !== 0) {
    return invalid("invalid-coordinate-count", "Coordinates must contain one or more xyz triples.");
  }

  const activeOrigin = origin ?? [coordinates[0] ?? Number.NaN, coordinates[1] ?? Number.NaN, coordinates[2] ?? Number.NaN];
  if (!isFiniteCoordinate(activeOrigin)) {
    return invalid("invalid-origin", "Coordinate origin must contain finite xyz values.");
  }

  const positions = new Float32Array(coordinates.length);
  for (let index = 0; index < coordinates.length; index += 1) {
    const value = coordinates[index];
    if (value === undefined || !Number.isFinite(value)) {
      return invalid("non-finite-coordinate", "Coordinates must contain finite numeric values.");
    }

    positions[index] = value - coordinateComponent(activeOrigin, index % 3);
  }

  return ok({ origin: activeOrigin, positions });
}

export function restoreCoordinates(
  localPositions: ArrayLike<number>,
  origin: Coordinate
): Result<Float64Array, CoordinateValidationError> {
  if (localPositions.length === 0 || localPositions.length % 3 !== 0) {
    return invalid("invalid-coordinate-count", "Local positions must contain one or more xyz triples.");
  }

  if (!isFiniteCoordinate(origin)) {
    return invalid("invalid-origin", "Coordinate origin must contain finite xyz values.");
  }

  const coordinates = new Float64Array(localPositions.length);
  for (let index = 0; index < localPositions.length; index += 1) {
    const value = localPositions[index];
    if (value === undefined || !Number.isFinite(value)) {
      return invalid("non-finite-coordinate", "Local positions must contain finite numeric values.");
    }

    coordinates[index] = value + coordinateComponent(origin, index % 3);
  }

  return ok(coordinates);
}

function isFiniteCoordinate(coordinate: Coordinate): boolean {
  return coordinate.every((value) => Number.isFinite(value));
}

function coordinateComponent(coordinate: Coordinate, axis: number): number {
  switch (axis) {
    case 0:
      return coordinate[0];
    case 1:
      return coordinate[1];
    default:
      return coordinate[2];
  }
}

function invalid(
  code: CoordinateValidationError["code"],
  message: string
): Result<never, CoordinateValidationError> {
  return err({ code, message });
}