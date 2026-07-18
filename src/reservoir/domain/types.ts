import type { Coordinate } from "../../domain/coordinates";
import type { UnitMetadata } from "../../domain/units";

export const reservoirSchemaVersion = "1.0.0";

export type NumericValues =
  | Float32Array
  | Float64Array
  | Int8Array
  | Uint8Array
  | Int16Array
  | Uint16Array
  | Int32Array
  | Uint32Array;

export type CoordinateValues = Float32Array | Float64Array;
export type OriginalCellIds = Uint32Array | BigUint64Array;

export interface CaseMetadata {
  readonly schemaVersion: string;
  readonly caseId: string;
  readonly caseName: string;
  readonly sourceFormat: SourceFormat;
  readonly coordinateReferenceSystem: CoordinateReferenceSystem;
  readonly units: readonly UnitMetadata[];
  readonly localOrigin: Coordinate;
  readonly creation: CreationMetadata;
}

export interface SourceFormat {
  readonly kind: "eclipse" | "open-standard" | "custom" | "unknown";
  readonly name: string;
  readonly version?: string;
}

export interface CoordinateReferenceSystem {
  readonly kind: "projected" | "geographic" | "local" | "unknown";
  readonly name: string;
  readonly epsgCode?: number;
}

export interface CreationMetadata {
  readonly createdAt: string;
  readonly createdBy?: string;
  readonly importedAt?: string;
  readonly importTool?: string;
}

export interface StructuredGridDimensions {
  readonly nx: number;
  readonly ny: number;
  readonly nz: number;
  readonly totalCellCount: number;
}

export const structuredCellIndexConvention = {
  kind: "i-fastest",
  formula: "cellId = i + nx * (j + ny * k)"
} as const;

export interface CoordinateConventionMetadata {
  readonly axisOrder: "xyz";
  readonly verticalDirection: "positive-down" | "positive-up";
  readonly depthReference: string;
  readonly cellIndexConvention: typeof structuredCellIndexConvention;
}

export interface CornerPointGridGeometry {
  readonly dimensions: StructuredGridDimensions;
  /** Six xyz values per pillar: top xyz followed by bottom xyz. */
  readonly pillarCoordinates: Float64Array;
  /** Eight corner depths per cell in the documented structured-cell order. */
  readonly cornerDepths: Float64Array;
  readonly activityMask?: Uint8Array;
  readonly originalCellIds: OriginalCellIds;
  readonly coordinateConvention: CoordinateConventionMetadata;
}

export interface ExplicitCellGeometry {
  /** Flattened xyz coordinates with three values per point. */
  readonly pointCoordinates: CoordinateValues;
  readonly connectivity: Uint32Array;
  /** Connectivity offsets with one more entry than the cell count. */
  readonly cellOffsets: Uint32Array;
  readonly cellTypes: Uint8Array;
  readonly originalCellIds: OriginalCellIds;
}

export type ReservoirGrid =
  | {
      readonly kind: "corner-point";
      readonly gridId: string;
      readonly displayName: string;
      readonly geometry: CornerPointGridGeometry;
    }
  | {
      readonly kind: "explicit";
      readonly gridId: string;
      readonly displayName: string;
      readonly geometry: ExplicitCellGeometry;
    };

export type PropertyLocation = "cell" | "point";
export type PropertyValueType = "float32" | "float64" | "int32" | "uint32" | "uint8";

export type NullRepresentation =
  | { readonly kind: "none" }
  | { readonly kind: "nan" }
  | { readonly kind: "sentinel"; readonly value: number }
  | { readonly kind: "validity-mask" };

export type PropertyTemporalKind =
  | { readonly kind: "static" }
  | { readonly kind: "dynamic" };

export interface PropertyDescriptor {
  readonly id: string;
  readonly keyword: string;
  readonly displayName: string;
  readonly unit: UnitMetadata;
  readonly location: PropertyLocation;
  readonly valueType: PropertyValueType;
  readonly nullRepresentation: NullRepresentation;
  readonly temporalKind: PropertyTemporalKind;
  readonly range?: { readonly min: number; readonly max: number };
}

export type FrameTime =
  | { readonly kind: "timestamp"; readonly value: string }
  | { readonly kind: "simulation-time"; readonly value: number; readonly unit: UnitMetadata };

export interface PropertyFrame {
  readonly propertyId: string;
  readonly timeStepIndex: number;
  readonly time: FrameTime;
  readonly values: NumericValues;
  readonly validityMask?: Uint8Array;
}

export interface WellTrajectory {
  readonly wellId: string;
  readonly wellName: string;
  readonly measuredDepths: Float64Array;
  readonly xyz: CoordinateValues;
  readonly datum: string;
  readonly coordinateReferenceSystem: CoordinateReferenceSystem;
}

export interface WellLogCurve {
  readonly wellId: string;
  readonly mnemonic: string;
  readonly unit: UnitMetadata;
  readonly description: string;
  readonly depthReference: string;
  readonly depths: Float64Array;
  readonly values: NumericValues;
  readonly nullValue: number | null;
  readonly validityMask?: Uint8Array;
}

export interface TimeStepMetadata {
  readonly index: number;
  readonly time: FrameTime;
  readonly label?: string;
}

export interface ReservoirCase {
  readonly metadata: CaseMetadata;
  readonly grids: readonly ReservoirGrid[];
  readonly propertyCatalog: readonly PropertyDescriptor[];
  readonly propertyFrames: readonly PropertyFrame[];
  readonly wells: readonly WellTrajectory[];
  readonly wellLogCurves: readonly WellLogCurve[];
  readonly timeStepCatalog: readonly TimeStepMetadata[];
}