import { faceCategories, type ReservoirSurfaceGeometry } from "../geometry/types";
import type { IJKClip, ReservoirProperty, ReservoirRenderGeometry, ReservoirVisibility } from "./types";

export interface ReservoirRenderPlan {
  readonly visibleFaceIndices: Uint32Array;
  readonly faceLocalCellIds: Uint32Array;
  readonly pointCoordinates: Float32Array;
  readonly vtkPolygons: Uint32Array;
  readonly localBounds: Float64Array;
}

export interface PropertyScalarPlan {
  readonly scalars: Float32Array;
  readonly range: readonly [number, number];
  readonly undefinedColor: readonly [number, number, number, number];
}

export function createReservoirRenderPlan(
  geometry: ReservoirRenderGeometry,
  visibility: ReservoirVisibility = {},
  clip: IJKClip = {}
): ReservoirRenderPlan {
  const faceCount = geometry.surface.faceLocalIndices.length;
  let visibleCount = 0;
  for (let faceIndex = 0; faceIndex < faceCount; faceIndex += 1) {
    if (isFaceVisible(geometry, faceIndex, visibility, clip)) {
      visibleCount += 1;
    }
  }

  const visibleFaceIndices = new Uint32Array(visibleCount);
  const faceLocalCellIds = new Uint32Array(visibleCount);
  const pointCoordinates = new Float32Array(visibleCount * 12);
  const vtkPolygons = new Uint32Array(visibleCount * 5);
  const localBounds = new Float64Array([Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity]);
  let visibleFaceOffset = 0;

  for (let faceIndex = 0; faceIndex < faceCount; faceIndex += 1) {
    if (!isFaceVisible(geometry, faceIndex, visibility, clip)) {
      continue;
    }

    visibleFaceIndices[visibleFaceOffset] = faceIndex;
    const cellId = faceCellId(geometry.surface, faceIndex, geometry.dimensions.nx, geometry.dimensions.ny);
    faceLocalCellIds[visibleFaceOffset] = cellId;
    const sourceOffset = faceIndex * 12;
    const destinationOffset = visibleFaceOffset * 12;
    const polygonOffset = visibleFaceOffset * 5;
    vtkPolygons[polygonOffset] = 4;

    for (let vertex = 0; vertex < 4; vertex += 1) {
      const coordinateOffset = destinationOffset + vertex * 3;
      const sourceCoordinateOffset = sourceOffset + vertex * 3;
      const x = (geometry.surface.pointCoordinates[sourceCoordinateOffset] ?? Number.NaN) - geometry.localOrigin[0];
      const y = (geometry.surface.pointCoordinates[sourceCoordinateOffset + 1] ?? Number.NaN) - geometry.localOrigin[1];
      const z = (geometry.surface.pointCoordinates[sourceCoordinateOffset + 2] ?? Number.NaN) - geometry.localOrigin[2];
      pointCoordinates[coordinateOffset] = x;
      pointCoordinates[coordinateOffset + 1] = y;
      pointCoordinates[coordinateOffset + 2] = z;
      vtkPolygons[polygonOffset + vertex + 1] = visibleFaceOffset * 4 + vertex;
      updateBounds(localBounds, x, y, z);
    }
    visibleFaceOffset += 1;
  }

  return { visibleFaceIndices, faceLocalCellIds, pointCoordinates, vtkPolygons, localBounds };
}

export function createPropertyScalarPlan(
  renderPlan: ReservoirRenderPlan,
  property: ReservoirProperty | undefined
): PropertyScalarPlan {
  const scalars = new Float32Array(renderPlan.pointCoordinates.length / 3);
  const undefinedColor = property?.undefinedColor ?? [0.32, 0.35, 0.38, property?.undefinedVisible === false ? 0 : 1];
  if (!property) {
    scalars.fill(Number.NaN);
    return { scalars, range: [0, 1], undefinedColor };
  }

  let minimum = Infinity;
  let maximum = -Infinity;
  for (let faceIndex = 0; faceIndex < renderPlan.faceLocalCellIds.length; faceIndex += 1) {
    const cellId = renderPlan.faceLocalCellIds[faceIndex] ?? 0;
    const value = readPropertyValue(property, cellId);
    for (let vertex = 0; vertex < 4; vertex += 1) {
      scalars[faceIndex * 4 + vertex] = value ?? Number.NaN;
    }
    if (value !== undefined) {
      minimum = Math.min(minimum, value);
      maximum = Math.max(maximum, value);
    }
  }

  const range = property.range
    ? [property.range.min, property.range.max] as const
    : Number.isFinite(minimum) && Number.isFinite(maximum)
      ? [minimum, maximum] as const
      : [0, 1] as const;
  return { scalars, range, undefinedColor };
}

export function readPropertyValue(property: ReservoirProperty | undefined, cellId: number): number | undefined {
  if (!property || property.validityMask?.[cellId] === 0) {
    return undefined;
  }
  const value = property.values[cellId];
  return value === undefined || !Number.isFinite(value) ? undefined : value;
}

function isFaceVisible(
  geometry: ReservoirRenderGeometry,
  faceIndex: number,
  visibility: ReservoirVisibility,
  clip: IJKClip
): boolean {
  const category = geometry.surface.faceCategories[faceIndex] ?? faceCategories.exterior;
  if (visibility.active === false) {
    return false;
  }
  if (category === faceCategories.exterior && visibility.exterior === false) {
    return false;
  }
  if (category === faceCategories.inactiveNeighborBoundary && visibility.inactiveNeighborBoundary === false) {
    return false;
  }
  if (category === faceCategories.faultDiscontinuity && visibility.faultDiscontinuity === false) {
    return false;
  }

  const ijkOffset = faceIndex * 3;
  const i = geometry.surface.faceIJK[ijkOffset] ?? 0;
  const j = geometry.surface.faceIJK[ijkOffset + 1] ?? 0;
  const k = geometry.surface.faceIJK[ijkOffset + 2] ?? 0;
  return insideRange(i, clip.i) && insideRange(j, clip.j) && insideRange(k, clip.k);
}

function insideRange(value: number, range: readonly [number, number] | undefined): boolean {
  return !range || value >= range[0] && value <= range[1];
}

function faceCellId(surface: ReservoirSurfaceGeometry, faceIndex: number, nx: number, ny: number): number {
  const offset = faceIndex * 3;
  const i = surface.faceIJK[offset] ?? 0;
  const j = surface.faceIJK[offset + 1] ?? 0;
  const k = surface.faceIJK[offset + 2] ?? 0;
  return i + nx * (j + ny * k);
}

function updateBounds(bounds: Float64Array, x: number, y: number, z: number): void {
  bounds[0] = Math.min(bounds[0] ?? Infinity, x);
  bounds[1] = Math.max(bounds[1] ?? -Infinity, x);
  bounds[2] = Math.min(bounds[2] ?? Infinity, y);
  bounds[3] = Math.max(bounds[3] ?? -Infinity, y);
  bounds[4] = Math.min(bounds[4] ?? Infinity, z);
  bounds[5] = Math.max(bounds[5] ?? -Infinity, z);
}