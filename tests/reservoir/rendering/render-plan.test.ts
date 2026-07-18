import { describe, expect, it } from "vitest";

import { extractReservoirSurface } from "../../../src/reservoir/geometry/surface-extractor";
import { createPropertyScalarPlan, createReservoirRenderPlan } from "../../../src/reservoir/rendering/render-plan";
import { createThreeByTwoByTwoPropertyFixture } from "../../../src/reservoir/testing/fixtures";

function renderGeometry() {
  const fixture = createThreeByTwoByTwoPropertyFixture();
  if (fixture.grid.kind !== "corner-point") {
    throw new Error("Synthetic fixture invariant failed.");
  }
  const extracted = extractReservoirSurface({ kind: "corner-point", geometry: fixture.grid.geometry });
  if (extracted.status !== "completed") {
    throw new Error("Synthetic extraction invariant failed.");
  }
  return { fixture, geometry: { surface: extracted.geometry, dimensions: fixture.expected.dimensions, localOrigin: fixture.localOrigin } };
}

describe("reservoir render planning", () => {
  it("filters inactive-neighbor faces and applies IJK clipping without vtk.js", () => {
    const { geometry } = renderGeometry();
    const allFaces = createReservoirRenderPlan(geometry);
    const hiddenBoundaries = createReservoirRenderPlan(geometry, { inactiveNeighborBoundary: false });
    const clipped = createReservoirRenderPlan(geometry, {}, { i: [0, 0] });

    expect(allFaces.visibleFaceIndices.length).toBe(34);
    expect(hiddenBoundaries.visibleFaceIndices.length).toBe(30);
    expect(clipped.visibleFaceIndices.length).toBeGreaterThan(0);
    expect(Array.from(clipped.faceLocalCellIds).every((cellId) => cellId % 3 === 0)).toBe(true);
    expect(allFaces.pointCoordinates[0]).toBe(0);
  });

  it("maps cell properties to point scalars and represents undefined values as NaN", () => {
    const { fixture, geometry } = renderGeometry();
    const plan = createReservoirRenderPlan(geometry);
    const validityMask = new Uint8Array(fixture.property?.frame.validityMask ?? []);
    validityMask[0] = 0;
    const scalars = createPropertyScalarPlan(plan, {
      values: fixture.property?.frame.values ?? new Float32Array(),
      validityMask,
      ...(fixture.expected.scalarRange ? { range: fixture.expected.scalarRange } : {}),
      undefinedVisible: false
    });

    expect(scalars.range).toEqual([100, 111]);
    expect(scalars.undefinedColor[3]).toBe(0);
    expect(Array.from(scalars.scalars).some(Number.isNaN)).toBe(true);
  });
});