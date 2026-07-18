import { describe, expect, it } from "vitest";

import { createModerateSurfaceBenchmarkInput } from "../../../src/reservoir/geometry/benchmark";
import { extractReservoirSurface } from "../../../src/reservoir/geometry/surface-extractor";

describe("surface extraction benchmark scaffold", () => {
  it("extracts the outer surface of a moderately sized generated grid", () => {
    const startedAt = performance.now();
    const outcome = extractReservoirSurface(createModerateSurfaceBenchmarkInput());
    const elapsedMilliseconds = performance.now() - startedAt;

    expect(outcome.status).toBe("completed");
    if (outcome.status !== "completed") {
      return;
    }

    expect(outcome.geometry.statistics.emittedFaceCount).toBe(1_920);
    expect(elapsedMilliseconds).toBeGreaterThanOrEqual(0);
  });
});