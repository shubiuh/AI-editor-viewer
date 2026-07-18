import { describe, expect, it } from "vitest";

import { isErr, isOk } from "../../../src/domain/result";
import { validateReservoirCase } from "../../../src/reservoir/domain/case-validation";

const unit = {
  id: "metre",
  label: "Metre",
  symbol: "m",
  dimension: "length" as const,
  toBaseFactor: 1
};

const grid = {
  kind: "explicit" as const,
  gridId: "main-grid",
  displayName: "Main grid",
  geometry: {
    pointCoordinates: new Float64Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]),
    connectivity: new Uint32Array([0, 1, 2, 3]),
    cellOffsets: new Uint32Array([0, 4]),
    cellTypes: new Uint8Array([10]),
    originalCellIds: new Uint32Array([0])
  }
};

describe("reservoir case validation", () => {
  it("accepts a version 1 case with one valid grid", () => {
    const reservoirCase = {
      metadata: {
        schemaVersion: "1.0.0",
        caseId: "case-a",
        caseName: "Case A",
        sourceFormat: { kind: "unknown" as const, name: "Synthetic" },
        coordinateReferenceSystem: { kind: "local" as const, name: "Case local" },
        units: [unit],
        localOrigin: [0, 0, 0] as const,
        creation: { createdAt: "2026-07-19T00:00:00Z" }
      },
      grids: [grid],
      propertyCatalog: [],
      wells: [],
      wellLogCurves: [],
      timeStepCatalog: []
    };

    expect(isOk(validateReservoirCase(reservoirCase))).toBe(true);
    expect(isErr(validateReservoirCase({ ...reservoirCase, grids: [grid, grid] }))).toBe(true);
  });
});