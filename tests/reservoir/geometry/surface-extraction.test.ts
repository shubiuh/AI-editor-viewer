import { describe, expect, it } from "vitest";

import { faceCategories } from "../../../src/reservoir/geometry/types";
import { extractReservoirSurface } from "../../../src/reservoir/geometry/surface-extractor";
import {
  createFaultedCornerPointFixture,
  createOneByOneByOneFixture,
  createPinchedCellFixture,
  createThreeByTwoByTwoPropertyFixture,
  createTwoByTwoByTwoFixture
} from "../../../src/reservoir/testing/fixtures";

function cornerPointInput(fixture: ReturnType<typeof createOneByOneByOneFixture>) {
  if (fixture.grid.kind !== "corner-point") {
    throw new Error("Synthetic fixture invariant failed.");
  }
  return { kind: "corner-point" as const, geometry: fixture.grid.geometry };
}

describe("reservoir surface extraction", () => {
  it("emits six exterior faces for one orthogonal cell with face metadata", () => {
    const outcome = extractReservoirSurface(cornerPointInput(createOneByOneByOneFixture()));

    expect(outcome.status).toBe("completed");
    if (outcome.status !== "completed") {
      return;
    }

    expect(outcome.geometry.statistics.emittedFaceCount).toBe(6);
    expect(outcome.geometry.statistics.exteriorFaceCount).toBe(6);
    expect(outcome.geometry.polygonConnectivity.length).toBe(24);
    expect(outcome.geometry.faceOriginalCellIds instanceof Uint32Array).toBe(true);
    if (outcome.geometry.faceOriginalCellIds instanceof Uint32Array) {
      expect(Array.from(outcome.geometry.faceOriginalCellIds)).toEqual([0, 0, 0, 0, 0, 0]);
    }
    expect(Array.from(outcome.geometry.faceLocalIndices)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(Array.from(outcome.geometry.faceIJK)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(Array.from(outcome.geometry.modelBounds)).toEqual([0, 1, 0, 1, 0, 1]);
  });

  it("removes geometrically continuous shared faces", () => {
    const outcome = extractReservoirSurface(cornerPointInput(createTwoByTwoByTwoFixture()));

    expect(outcome.status).toBe("completed");
    if (outcome.status !== "completed") {
      return;
    }

    expect(outcome.geometry.statistics.emittedFaceCount).toBe(24);
    expect(outcome.geometry.statistics.exteriorFaceCount).toBe(24);
    expect(outcome.geometry.statistics.skippedContinuousFaceCount).toBe(24);
  });

  it("retains active faces adjoining inactive cells", () => {
    const outcome = extractReservoirSurface(cornerPointInput(createThreeByTwoByTwoPropertyFixture()));

    expect(outcome.status).toBe("completed");
    if (outcome.status !== "completed") {
      return;
    }

    expect(outcome.geometry.statistics.emittedFaceCount).toBe(34);
    expect(outcome.geometry.statistics.inactiveNeighborBoundaryFaceCount).toBe(4);
    expect(Array.from(outcome.geometry.faceCategories).filter((category) => category === faceCategories.inactiveNeighborBoundary).length).toBe(4);
  });

  it("retains discontinuous shared faces as fault faces", () => {
    const outcome = extractReservoirSurface(cornerPointInput(createFaultedCornerPointFixture()));

    expect(outcome.status).toBe("completed");
    if (outcome.status !== "completed") {
      return;
    }

    expect(outcome.geometry.statistics.emittedFaceCount).toBe(12);
    expect(outcome.geometry.statistics.faultDiscontinuityFaceCount).toBe(2);
    expect(Array.from(outcome.geometry.faceCategories).filter((category) => category === faceCategories.faultDiscontinuity).length).toBe(2);
  });

  it("skips degenerate faces without producing non-finite output", () => {
    const outcome = extractReservoirSurface(cornerPointInput(createPinchedCellFixture()));

    expect(outcome.status).toBe("completed");
    if (outcome.status !== "completed") {
      return;
    }

    expect(outcome.geometry.statistics.skippedDegenerateFaceCount).toBe(4);
    expect(outcome.geometry.statistics.emittedFaceCount).toBe(2);
    expect(Array.from(outcome.geometry.pointCoordinates).every(Number.isFinite)).toBe(true);
  });

  it("reports progress and supports pre-cancelled extraction", () => {
    const progress: number[] = [];
    const completed = extractReservoirSurface(cornerPointInput(createOneByOneByOneFixture()), {
      progressIntervalCells: 1,
      onProgress: (event) => progress.push(event.fraction)
    });
    const cancelled = extractReservoirSurface(cornerPointInput(createOneByOneByOneFixture()), {
      shouldCancel: () => true
    });

    expect(completed.status).toBe("completed");
    expect(progress).toContain(0);
    expect(progress).toContain(1);
    expect(cancelled.status).toBe("cancelled");
  });
});