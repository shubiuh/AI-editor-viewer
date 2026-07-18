import { describe, expect, it } from "vitest";

import { isErr, isOk } from "../../../src/domain/result";
import { rebaseCoordinates, restoreCoordinates } from "../../../src/domain/coordinates";
import { validateCornerPointGridGeometry, validateReservoirGrid, validateStructuredGridDimensions } from "../../../src/reservoir/domain/grid-validation";
import { validatePropertyFrame } from "../../../src/reservoir/domain/series-validation";
import {
  createAllValidFixtures,
  createFaultedCornerPointFixture,
  createInvalidFixtures,
  createLargeCoordinateFixture,
  createThreeByTwoByTwoPropertyFixture,
  createTwoByTwoByTwoFixture,
  visibleExteriorFaceCount
} from "../../../src/reservoir/testing/fixtures";

describe("synthetic reservoir fixtures", () => {
  it("generates only valid grid contracts and matching expected dimensions", () => {
    for (const fixture of createAllValidFixtures()) {
      expect(isOk(validateReservoirGrid(fixture.grid))).toBe(true);
      expect(fixture.expected.totalCellCount).toBe(fixture.expected.dimensions.totalCellCount);
      expect(fixture.expected.originalCellIds.length).toBe(fixture.expected.totalCellCount);
    }
  });

  it("has known orthogonal counts, bounds, centers, and IJK mapping", () => {
    const fixture = createTwoByTwoByTwoFixture();

    expect(fixture.expected.activeCellCount).toBe(8);
    expect(fixture.expected.visibleExteriorFaceCount).toBe(24);
    expect(fixture.expected.bounds).toEqual([0, 20, 0, 40, 0, 10]);
    expect(fixture.expected.knownCellCenters[1]).toEqual({ cellId: 7, ijk: [1, 1, 1], center: [15, 30, 7.5] });
  });

  it("tracks an inactive cell, scalar range, and visible faces", () => {
    const fixture = createThreeByTwoByTwoPropertyFixture();
    const activityMask = fixture.grid.kind === "corner-point" ? fixture.grid.geometry.activityMask : undefined;

    expect(fixture.expected.activeCellCount).toBe(11);
    expect(fixture.expected.visibleExteriorFaceCount).toBe(34);
    expect(visibleExteriorFaceCount(fixture.expected.dimensions, activityMask)).toBe(34);
    expect(fixture.expected.scalarRange).toEqual({ min: 100, max: 111 });
    expect(fixture.expected.knownCellCenters[1]).toEqual({ cellId: 11, ijk: [2, 1, 1], center: [125, 215, 1003] });
    expect(fixture.property?.frame.validityMask?.[1]).toBe(0);
  });

  it("contains a fault discontinuity and a valid pinched geometry", () => {
    const faulted = createFaultedCornerPointFixture();
    const pinched = createAllValidFixtures().find((fixture) => fixture.id === "pinched-cell");

    if (faulted.grid.kind !== "corner-point" || !pinched || pinched.grid.kind !== "corner-point") {
      throw new Error("Synthetic fixture invariant failed.");
    }

    expect(faulted.grid.geometry.pillarCoordinates[8]).toBe(2);
    expect(faulted.grid.geometry.cornerDepths[8]).toBe(2);
    expect(pinched.grid.geometry.cornerDepths.every((depth) => depth === 100)).toBe(true);
  });

  it("rebases and restores realistic map coordinates", () => {
    const fixture = createLargeCoordinateFixture();
    if (fixture.grid.kind !== "corner-point") {
      throw new Error("Synthetic fixture invariant failed.");
    }

    const rebased = rebaseCoordinates(fixture.grid.geometry.pillarCoordinates, fixture.localOrigin);
    expect(isOk(rebased)).toBe(true);
    if (!isOk(rebased)) {
      return;
    }

    expect(Array.from(rebased.value.positions.slice(0, 3))).toEqual([0, 0, 0]);
    const restored = restoreCoordinates(rebased.value.positions, fixture.localOrigin);
    expect(isOk(restored)).toBe(true);
    if (isOk(restored)) {
      expect(Array.from(restored.value)).toEqual(Array.from(fixture.grid.geometry.pillarCoordinates));
    }
  });

  it("supplies invalid fixtures rejected by the domain validators", () => {
    const invalid = createInvalidFixtures();

    expect(isErr(validateCornerPointGridGeometry(invalid.incorrectCornerDepthCount))).toBe(true);
    expect(isErr(validateCornerPointGridGeometry(invalid.incorrectActivityMaskCount))).toBe(true);
    expect(isErr(validateCornerPointGridGeometry(invalid.nanCoordinates))).toBe(true);
    expect(isErr(validateStructuredGridDimensions(invalid.negativeDimensions))).toBe(true);
    expect(isErr(validatePropertyFrame(invalid.inconsistentPropertyLength, 2))).toBe(true);
  });
});