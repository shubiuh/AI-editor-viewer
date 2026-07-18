import type { Coordinate } from "../../domain/coordinates";
import type { NumericValues, StructuredGridDimensions } from "../domain/types";
import type { ReservoirSurfaceGeometry } from "../geometry/types";

export type GeologicalView = "top" | "bottom" | "north" | "south" | "east" | "west" | "isometric";
export type ReservoirRepresentation = "surface" | "surface-with-edges" | "wireframe";

export interface ReservoirRenderGeometry {
  readonly surface: ReservoirSurfaceGeometry;
  readonly dimensions: StructuredGridDimensions;
  readonly localOrigin: Coordinate;
  readonly activityMask?: Uint8Array;
}

export interface ReservoirProperty {
  /** Values are indexed by local structured cell ID. */
  readonly values: NumericValues;
  readonly validityMask?: Uint8Array;
  readonly range?: { readonly min: number; readonly max: number };
  readonly undefinedVisible?: boolean;
  readonly undefinedColor?: readonly [number, number, number, number];
}

export interface ReservoirVisibility {
  readonly exterior?: boolean;
  readonly inactiveNeighborBoundary?: boolean;
  readonly faultDiscontinuity?: boolean;
  readonly active?: boolean;
}

export interface IJKClip {
  readonly i?: readonly [number, number];
  readonly j?: readonly [number, number];
  readonly k?: readonly [number, number];
}

export interface ReservoirPickResult {
  readonly originalCellId: number | bigint;
  readonly ijk: Coordinate;
  readonly propertyValue: number | undefined;
  readonly worldCoordinate: Coordinate;
}

export interface GeologicalCameraPose {
  readonly position: Coordinate;
  readonly focalPoint: Coordinate;
  readonly viewUp: Coordinate;
}