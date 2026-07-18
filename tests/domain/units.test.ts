import { describe, expect, it } from "vitest";

import { isErr, isOk } from "../../src/domain/result";
import { validateUnitMetadata } from "../../src/domain/units";

describe("unit metadata validation", () => {
  it("accepts valid metadata and trims text fields", () => {
    const result = validateUnitMetadata({
      id: "  metre ",
      label: " Metre ",
      symbol: " m ",
      dimension: "length",
      toBaseFactor: 1
    });

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toEqual({
        id: "metre",
        label: "Metre",
        symbol: "m",
        dimension: "length",
        toBaseFactor: 1
      });
    }
  });

  it("rejects invalid dimensions and non-finite conversion values", () => {
    const invalidDimension = validateUnitMetadata({
      id: "bar",
      label: "Bar",
      symbol: "bar",
      dimension: "mass",
      toBaseFactor: 100_000
    });
    const invalidFactor = validateUnitMetadata({
      id: "bar",
      label: "Bar",
      symbol: "bar",
      dimension: "pressure",
      toBaseFactor: Number.NaN
    });

    expect(isErr(invalidDimension)).toBe(true);
    expect(isErr(invalidFactor)).toBe(true);
  });
});