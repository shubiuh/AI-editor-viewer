import { createOrthogonalCornerPointGeometry } from "../testing/fixtures/generators";
import type { StructuredSurfaceInput } from "./types";

export function createModerateSurfaceBenchmarkInput(): StructuredSurfaceInput {
  const dimensions = { nx: 24, ny: 24, nz: 8, totalCellCount: 4_608 };
  return {
    kind: "corner-point",
    geometry: createOrthogonalCornerPointGeometry({
      gridId: "surface-benchmark",
      displayName: "Surface benchmark grid",
      dimensions,
      origin: [500_000, 6_500_000, 0],
      cellSize: [25, 25, 2]
    })
  };
}