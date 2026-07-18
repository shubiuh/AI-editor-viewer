import { describe, expect, it } from "vitest";

import { isErr, isOk } from "../../../src/domain/result";
import {
  validateCornerPointGridGeometry,
  validateExplicitCellGeometry,
  validateStructuredGridDimensions
} from "../../../src/reservoir/domain/grid-validation";
import { structuredCellIndexConvention } from "../../../src/reservoir/domain/types";

describe("reservoir grid validation", () => {
  it("validates structured dimensions and the documented i-fastest convention", () => {
    const dimensions = { nx: 2, ny: 1, nz: 1, totalCellCount: 2 };
    const result = validateStructuredGridDimensions(dimensions);

    expect(isOk(result)).toBe(true);
    expect(structuredCellIndexConvention.formula).toBe("cellId = i + nx * (j + ny * k)");
    expect(isErr(validateStructuredGridDimensions({ ...dimensions, totalCellCount: 3 }))).toBe(true);
  });

  it("rejects mismatched corner-point array lengths", () => {
    const result = validateCornerPointGridGeometry({
      dimensions: { nx: 1, ny: 1, nz: 1, totalCellCount: 1 },
      pillarCoordinates: new Float64Array(24),
      cornerDepths: new Float64Array(7),
      originalCellIds: new Uint32Array([0]),
      coordinateConvention: {
        axisOrder: "xyz",
        verticalDirection: "positive-down",
        depthReference: "datum",
        cellIndexConvention: structuredCellIndexConvention
      }
    });

    expect(isErr(result)).toBe(true);
  });

  it("validates explicit offsets and original cell IDs", () => {
    const validGeometry = {
      pointCoordinates: new Float64Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]),
      connectivity: new Uint32Array([0, 1, 2, 3]),
      cellOffsets: new Uint32Array([0, 4]),
      cellTypes: new Uint8Array([10]),
      originalCellIds: new Uint32Array([42])
    };

    expect(isOk(validateExplicitCellGeometry(validGeometry))).toBe(true);
    expect(isErr(validateExplicitCellGeometry({ ...validGeometry, originalCellIds: new Uint32Array() }))).toBe(true);
  });
});