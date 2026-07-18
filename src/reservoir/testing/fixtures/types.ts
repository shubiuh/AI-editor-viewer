import type { Coordinate } from "../../../domain/coordinates";
import type {
  PropertyDescriptor,
  PropertyFrame,
  ReservoirGrid,
  StructuredGridDimensions
} from "../../domain/types";

export type AxisAlignedBounds = readonly [number, number, number, number, number, number];

export interface KnownCellCenter {
  readonly cellId: number;
  readonly ijk: readonly [number, number, number];
  readonly center: Coordinate;
}

export interface ScalarRangeExpectation {
  readonly min: number;
  readonly max: number;
}

export interface FixtureExpectations {
  readonly dimensions: StructuredGridDimensions;
  readonly totalCellCount: number;
  readonly activeCellCount: number;
  readonly bounds: AxisAlignedBounds;
  readonly visibleExteriorFaceCount: number;
  readonly originalCellIds: Uint32Array;
  readonly scalarRange: ScalarRangeExpectation | null;
  readonly knownCellCenters: readonly KnownCellCenter[];
}

export interface SyntheticReservoirFixture {
  readonly id: string;
  readonly description: string;
  readonly grid: ReservoirGrid;
  readonly localOrigin: Coordinate;
  readonly property?: {
    readonly descriptor: PropertyDescriptor;
    readonly frame: PropertyFrame;
  };
  readonly expected: FixtureExpectations;
}