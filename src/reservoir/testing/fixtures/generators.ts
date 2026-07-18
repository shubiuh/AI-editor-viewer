import { structuredCellIndexConvention, type CornerPointGridGeometry, type StructuredGridDimensions } from "../../domain/types";
import type { AxisAlignedBounds, KnownCellCenter } from "./types";

export interface OrthogonalGridOptions {
  readonly gridId: string;
  readonly displayName: string;
  readonly dimensions: StructuredGridDimensions;
  readonly origin: readonly [number, number, number];
  readonly cellSize: readonly [number, number, number];
  readonly activityMask?: Uint8Array;
}

export function createOrthogonalCornerPointGeometry(options: OrthogonalGridOptions): CornerPointGridGeometry {
  const { nx, ny, nz, totalCellCount } = options.dimensions;
  const pillarCoordinates = new Float64Array((nx + 1) * (ny + 1) * 6);
  const cornerDepths = new Float64Array(totalCellCount * 8);
  const originalCellIds = new Uint32Array(totalCellCount);
  const [originX, originY, originZ] = options.origin;
  const [sizeX, sizeY, sizeZ] = options.cellSize;

  let pillarOffset = 0;
  for (let j = 0; j <= ny; j += 1) {
    for (let i = 0; i <= nx; i += 1) {
      const x = originX + i * sizeX;
      const y = originY + j * sizeY;
      pillarCoordinates.set([x, y, originZ, x, y, originZ + nz * sizeZ], pillarOffset);
      pillarOffset += 6;
    }
  }

  for (let k = 0; k < nz; k += 1) {
    for (let j = 0; j < ny; j += 1) {
      for (let i = 0; i < nx; i += 1) {
        const cellId = structuredCellId(i, j, k, nx, ny);
        const topDepth = originZ + k * sizeZ;
        const bottomDepth = topDepth + sizeZ;
        cornerDepths.set([topDepth, topDepth, topDepth, topDepth, bottomDepth, bottomDepth, bottomDepth, bottomDepth], cellId * 8);
        originalCellIds[cellId] = cellId;
      }
    }
  }

  return {
    dimensions: options.dimensions,
    pillarCoordinates,
    cornerDepths,
    ...(options.activityMask ? { activityMask: options.activityMask } : {}),
    originalCellIds,
    coordinateConvention: {
      axisOrder: "xyz",
      verticalDirection: "positive-down",
      depthReference: "synthetic datum",
      cellIndexConvention: structuredCellIndexConvention
    }
  };
}

export function structuredCellId(i: number, j: number, k: number, nx: number, ny: number): number {
  return i + nx * (j + ny * k);
}

export function activeCellCount(activityMask: Uint8Array | undefined, totalCellCount: number): number {
  if (!activityMask) {
    return totalCellCount;
  }

  let count = 0;
  for (const value of activityMask) {
    if (value !== 0) {
      count += 1;
    }
  }
  return count;
}

export function visibleExteriorFaceCount(
  dimensions: StructuredGridDimensions,
  activityMask?: Uint8Array
): number {
  const { nx, ny, nz } = dimensions;
  let faces = 0;

  for (let k = 0; k < nz; k += 1) {
    for (let j = 0; j < ny; j += 1) {
      for (let i = 0; i < nx; i += 1) {
        const cellId = structuredCellId(i, j, k, nx, ny);
        if (activityMask && activityMask[cellId] === 0) {
          continue;
        }

        faces += isInactiveOrOutside(i - 1, j, k, dimensions, activityMask) ? 1 : 0;
        faces += isInactiveOrOutside(i + 1, j, k, dimensions, activityMask) ? 1 : 0;
        faces += isInactiveOrOutside(i, j - 1, k, dimensions, activityMask) ? 1 : 0;
        faces += isInactiveOrOutside(i, j + 1, k, dimensions, activityMask) ? 1 : 0;
        faces += isInactiveOrOutside(i, j, k - 1, dimensions, activityMask) ? 1 : 0;
        faces += isInactiveOrOutside(i, j, k + 1, dimensions, activityMask) ? 1 : 0;
      }
    }
  }

  return faces;
}

export function orthogonalBounds(
  dimensions: StructuredGridDimensions,
  origin: readonly [number, number, number],
  cellSize: readonly [number, number, number]
): AxisAlignedBounds {
  return [
    origin[0], origin[0] + dimensions.nx * cellSize[0],
    origin[1], origin[1] + dimensions.ny * cellSize[1],
    origin[2], origin[2] + dimensions.nz * cellSize[2]
  ];
}

export function orthogonalCellCenter(
  i: number,
  j: number,
  k: number,
  origin: readonly [number, number, number],
  cellSize: readonly [number, number, number],
  nx: number,
  ny: number
): KnownCellCenter {
  return {
    cellId: structuredCellId(i, j, k, nx, ny),
    ijk: [i, j, k],
    center: [
      origin[0] + (i + 0.5) * cellSize[0],
      origin[1] + (j + 0.5) * cellSize[1],
      origin[2] + (k + 0.5) * cellSize[2]
    ]
  };
}

function isInactiveOrOutside(
  i: number,
  j: number,
  k: number,
  dimensions: StructuredGridDimensions,
  activityMask: Uint8Array | undefined
): boolean {
  if (i < 0 || j < 0 || k < 0 || i >= dimensions.nx || j >= dimensions.ny || k >= dimensions.nz) {
    return true;
  }

  return activityMask?.[structuredCellId(i, j, k, dimensions.nx, dimensions.ny)] === 0;
}