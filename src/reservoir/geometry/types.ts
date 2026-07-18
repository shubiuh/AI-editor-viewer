import type { CornerPointGridGeometry, OriginalCellIds, StructuredGridDimensions } from "../domain/types";

export const faceCategories = {
  exterior: 0,
  inactiveNeighborBoundary: 1,
  faultDiscontinuity: 2
} as const;

export type FaceCategory = (typeof faceCategories)[keyof typeof faceCategories];

export type StructuredSurfaceInput =
  | { readonly kind: "corner-point"; readonly geometry: CornerPointGridGeometry }
  | {
      readonly kind: "cell-corners";
      readonly dimensions: StructuredGridDimensions;
      /** Flattened xyz values: eight corners and 24 values per cell. */
      readonly cellCorners: Float64Array;
      readonly activityMask?: Uint8Array;
      readonly originalCellIds: OriginalCellIds;
    };

export interface SurfaceExtractionControl {
  readonly signal?: AbortSignal;
  readonly shouldCancel?: () => boolean;
  readonly onProgress?: (progress: SurfaceExtractionProgress) => void;
  readonly progressIntervalCells?: number;
}

export interface SurfaceExtractionProgress {
  readonly phase: "classify" | "emit";
  readonly completedCellCount: number;
  readonly totalCellCount: number;
  readonly fraction: number;
}

export interface GeometryStatistics {
  readonly totalCellCount: number;
  readonly activeCellCount: number;
  readonly candidateFaceCount: number;
  readonly emittedFaceCount: number;
  readonly exteriorFaceCount: number;
  readonly inactiveNeighborBoundaryFaceCount: number;
  readonly faultDiscontinuityFaceCount: number;
  readonly skippedContinuousFaceCount: number;
  readonly skippedDegenerateFaceCount: number;
}

export interface ReservoirSurfaceGeometry {
  /** Flattened Float64 xyz positions, four vertices per emitted quad. */
  readonly pointCoordinates: Float64Array;
  /** Four point indices per emitted quad. */
  readonly polygonConnectivity: Uint32Array;
  readonly polygonOffsets: Uint32Array;
  readonly faceOriginalCellIds: OriginalCellIds;
  readonly faceLocalIndices: Uint8Array;
  /** Flattened i, j, k triplets aligned with emitted faces. */
  readonly faceIJK: Uint32Array;
  /** Local structured neighbor cell IDs, or -1 when no neighbor exists. */
  readonly neighborCellIds: Int32Array;
  readonly faceCategories: Uint8Array;
  readonly modelBounds: Float64Array;
  readonly statistics: GeometryStatistics;
}

export type SurfaceExtractionOutcome =
  | { readonly status: "completed"; readonly geometry: ReservoirSurfaceGeometry }
  | { readonly status: "cancelled"; readonly statistics: GeometryStatistics }
  | { readonly status: "invalid-input"; readonly code: string; readonly message: string };