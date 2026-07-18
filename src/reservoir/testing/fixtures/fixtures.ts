import {
  reservoirSchemaVersion,
  type OriginalCellIds,
  type PropertyDescriptor,
  type PropertyFrame,
  type ReservoirGrid,
  type StructuredGridDimensions
} from "../../domain/types";
import {
  activeCellCount,
  createOrthogonalCornerPointGeometry,
  orthogonalBounds,
  orthogonalCellCenter,
  structuredCellId,
  visibleExteriorFaceCount
} from "./generators";
import type { SyntheticReservoirFixture } from "./types";

const dimensionlessUnit = {
  id: "fraction",
  label: "Fraction",
  symbol: "-",
  dimension: "dimensionless" as const,
  toBaseFactor: 1
};

const scalarDescriptor: PropertyDescriptor = {
  id: "synthetic-porosity",
  keyword: "PORO",
  displayName: "Synthetic porosity",
  unit: dimensionlessUnit,
  location: "cell",
  valueType: "float32",
  nullRepresentation: { kind: "validity-mask" },
  temporalKind: { kind: "static" },
  range: { min: 100, max: 111 }
};

export function createOneByOneByOneFixture(): SyntheticReservoirFixture {
  return createOrthogonalFixture("orthogonal-1x1x1", "One orthogonal active cell.", { nx: 1, ny: 1, nz: 1, totalCellCount: 1 }, [0, 0, 0], [1, 1, 1]);
}

export function createTwoByTwoByTwoFixture(): SyntheticReservoirFixture {
  return createOrthogonalFixture("orthogonal-2x2x2", "Eight orthogonal active cells.", { nx: 2, ny: 2, nz: 2, totalCellCount: 8 }, [0, 0, 0], [10, 20, 5]);
}

export function createThreeByTwoByTwoPropertyFixture(): SyntheticReservoirFixture {
  const dimensions = { nx: 3, ny: 2, nz: 2, totalCellCount: 12 };
  const activityMask = new Uint8Array(dimensions.totalCellCount).fill(1);
  const inactiveCellId = structuredCellId(1, 0, 0, dimensions.nx, dimensions.ny);
  activityMask[inactiveCellId] = 0;
  const fixture = createOrthogonalFixture("orthogonal-3x2x2-inactive", "Twelve cells with one inactive cell and one scalar property.", dimensions, [100, 200, 1000], [10, 10, 2], activityMask);
  const values = new Float32Array(dimensions.totalCellCount);
  const validityMask = new Uint8Array(dimensions.totalCellCount).fill(1);
  for (let cellId = 0; cellId < values.length; cellId += 1) {
    values[cellId] = 100 + cellId;
  }
  values[inactiveCellId] = Number.NaN;
  validityMask[inactiveCellId] = 0;
  const frame: PropertyFrame = {
    propertyId: scalarDescriptor.id,
    timeStepIndex: 0,
    time: { kind: "timestamp", value: "2026-01-01T00:00:00Z" },
    values,
    validityMask
  };

  return {
    ...fixture,
    property: { descriptor: scalarDescriptor, frame },
    expected: {
      ...fixture.expected,
      scalarRange: { min: 100, max: 111 },
      knownCellCenters: [
        orthogonalCellCenter(0, 0, 0, [100, 200, 1000], [10, 10, 2], 3, 2),
        orthogonalCellCenter(2, 1, 1, [100, 200, 1000], [10, 10, 2], 3, 2)
      ]
    }
  };
}

export function createFaultedCornerPointFixture(): SyntheticReservoirFixture {
  const dimensions = { nx: 2, ny: 1, nz: 1, totalCellCount: 2 };
  const geometry = createOrthogonalCornerPointGeometry({
    gridId: "faulted-grid",
    displayName: "Faulted corner-point grid",
    dimensions,
    origin: [0, 0, 0],
    cellSize: [10, 10, 10]
  });
  geometry.pillarCoordinates.set([10, 0, 2, 10, 0, 12], 6);
  geometry.pillarCoordinates.set([10, 10, 2, 10, 10, 12], 18);
  geometry.cornerDepths.set([2, 2, 2, 2, 12, 12, 12, 12], 8);

  return createFixture(
    "faulted-corner-point",
    "Two cells with a deliberate two-unit vertical pillar and depth discontinuity.",
    cornerPointGrid("faulted-grid", "Faulted corner-point grid", geometry),
    [0, 0, 0],
    {
      dimensions,
      totalCellCount: 2,
      activeCellCount: 2,
      bounds: [0, 20, 0, 10, 0, 12],
      visibleExteriorFaceCount: 10,
      originalCellIds: new Uint32Array([0, 1]),
      scalarRange: null,
      knownCellCenters: [
        { cellId: 0, ijk: [0, 0, 0], center: [5, 5, 5] },
        { cellId: 1, ijk: [1, 0, 0], center: [15, 5, 7] }
      ]
    }
  );
}

export function createPinchedCellFixture(): SyntheticReservoirFixture {
  const dimensions = { nx: 1, ny: 1, nz: 1, totalCellCount: 1 };
  const geometry = createOrthogonalCornerPointGeometry({
    gridId: "pinched-grid",
    displayName: "Pinched grid",
    dimensions,
    origin: [0, 0, 100],
    cellSize: [10, 10, 0]
  });

  return createFixture(
    "pinched-cell",
    "One zero-thickness degenerate corner-point cell.",
    cornerPointGrid("pinched-grid", "Pinched grid", geometry),
    [0, 0, 100],
    {
      dimensions,
      totalCellCount: 1,
      activeCellCount: 1,
      bounds: [0, 10, 0, 10, 100, 100],
      visibleExteriorFaceCount: 6,
      originalCellIds: new Uint32Array([0]),
      scalarRange: null,
      knownCellCenters: [{ cellId: 0, ijk: [0, 0, 0], center: [5, 5, 100] }]
    }
  );
}

export function createLargeCoordinateFixture(): SyntheticReservoirFixture {
  return createOrthogonalFixture(
    "large-map-coordinates",
    "One cell near realistic map coordinates for local-origin rebasing.",
    { nx: 1, ny: 1, nz: 1, totalCellCount: 1 },
    [500_000, 6_500_000, 150],
    [100, 100, 50]
  );
}

export function createInvalidFixtures() {
  const valid = createOneByOneByOneFixture();
  if (valid.grid.kind !== "corner-point") {
    throw new Error("Synthetic fixture invariant failed.");
  }

  const geometry = valid.grid.geometry;
  return {
    incorrectCornerDepthCount: {
      ...geometry,
      cornerDepths: new Float64Array(7)
    },
    incorrectActivityMaskCount: {
      ...geometry,
      activityMask: new Uint8Array()
    },
    nanCoordinates: {
      ...geometry,
      pillarCoordinates: Float64Array.from(geometry.pillarCoordinates, (value, index) => index === 0 ? Number.NaN : value)
    },
    negativeDimensions: {
      ...geometry.dimensions,
      nx: -1,
      totalCellCount: -1
    },
    inconsistentPropertyLength: {
      propertyId: scalarDescriptor.id,
      timeStepIndex: 0,
      time: { kind: "timestamp" as const, value: "2026-01-01T00:00:00Z" },
      values: new Float32Array([100]),
      validityMask: new Uint8Array([1, 1])
    }
  };
}

export function createAllValidFixtures(): readonly SyntheticReservoirFixture[] {
  return [
    createOneByOneByOneFixture(),
    createTwoByTwoByTwoFixture(),
    createThreeByTwoByTwoPropertyFixture(),
    createFaultedCornerPointFixture(),
    createPinchedCellFixture(),
    createLargeCoordinateFixture()
  ];
}

function createOrthogonalFixture(
  id: string,
  description: string,
  dimensions: StructuredGridDimensions,
  origin: readonly [number, number, number],
  cellSize: readonly [number, number, number],
  activityMask?: Uint8Array
): SyntheticReservoirFixture {
  const geometry = createOrthogonalCornerPointGeometry({
    gridId: id,
    displayName: id,
    dimensions,
    origin,
    cellSize,
    ...(activityMask ? { activityMask } : {})
  });
  return createFixture(id, description, cornerPointGrid(id, id, geometry), origin, {
    dimensions,
    totalCellCount: dimensions.totalCellCount,
    activeCellCount: activeCellCount(activityMask, dimensions.totalCellCount),
    bounds: orthogonalBounds(dimensions, origin, cellSize),
    visibleExteriorFaceCount: visibleExteriorFaceCount(dimensions, activityMask),
    originalCellIds: copyFixtureCellIds(geometry.originalCellIds),
    scalarRange: null,
    knownCellCenters: [
      orthogonalCellCenter(0, 0, 0, origin, cellSize, dimensions.nx, dimensions.ny),
      orthogonalCellCenter(dimensions.nx - 1, dimensions.ny - 1, dimensions.nz - 1, origin, cellSize, dimensions.nx, dimensions.ny)
    ]
  });
}

function cornerPointGrid(gridId: string, displayName: string, geometry: ReturnType<typeof createOrthogonalCornerPointGeometry>): ReservoirGrid {
  return { kind: "corner-point", gridId, displayName, geometry };
}

function createFixture(
  id: string,
  description: string,
  grid: ReservoirGrid,
  localOrigin: readonly [number, number, number],
  expected: SyntheticReservoirFixture["expected"]
): SyntheticReservoirFixture {
  return { id, description, grid, localOrigin, expected };
}

function copyFixtureCellIds(cellIds: OriginalCellIds): Uint32Array {
  if (cellIds instanceof Uint32Array) {
    return new Uint32Array(cellIds);
  }

  return Uint32Array.from(cellIds, (cellId) => Number(cellId));
}

export const fixtureSchemaVersion = reservoirSchemaVersion;