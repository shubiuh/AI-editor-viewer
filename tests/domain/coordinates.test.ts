import { describe, expect, it } from "vitest";

import { isErr, isOk } from "../../src/domain/result";
import { rebaseCoordinates, restoreCoordinates } from "../../src/domain/coordinates";

describe("coordinate rebasing", () => {
  it("rebases coordinates around the first point and restores the original values", () => {
    const worldCoordinates = new Float64Array([
      1_000_000, 2_000_000, -3_000_000,
      1_000_010, 2_000_020, -2_999_970
    ]);
    const rebased = rebaseCoordinates(worldCoordinates);

    expect(isOk(rebased)).toBe(true);
    if (!isOk(rebased)) {
      return;
    }

    expect(rebased.value.origin).toEqual([1_000_000, 2_000_000, -3_000_000]);
    expect(Array.from(rebased.value.positions)).toEqual([0, 0, 0, 10, 20, 30]);

    const restored = restoreCoordinates(rebased.value.positions, rebased.value.origin);
    expect(isOk(restored)).toBe(true);
    if (isOk(restored)) {
      expect(Array.from(restored.value)).toEqual(Array.from(worldCoordinates));
    }
  });

  it("rejects incomplete triples and non-finite values", () => {
    const incomplete = rebaseCoordinates([0, 1]);
    const nonFinite = rebaseCoordinates([0, 0, Number.NaN]);

    expect(isErr(incomplete)).toBe(true);
    expect(isErr(nonFinite)).toBe(true);
  });
});