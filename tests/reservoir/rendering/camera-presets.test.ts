import { describe, expect, it } from "vitest";

import { geologicalCameraPose } from "../../../src/reservoir/rendering/camera-presets";

describe("geological camera presets", () => {
  const bounds = new Float64Array([0, 20, 0, 10, 100, 120]);

  it("uses geological depth orientation for top and bottom", () => {
    const top = geologicalCameraPose(bounds, "top");
    const bottom = geologicalCameraPose(bounds, "bottom");

    expect(top.position[2]).toBeLessThan(top.focalPoint[2]);
    expect(bottom.position[2]).toBeGreaterThan(bottom.focalPoint[2]);
  });

  it("provides a deterministic isometric pose", () => {
    expect(geologicalCameraPose(bounds, "isometric")).toEqual({
      position: [50, -35, 70],
      focalPoint: [10, 5, 110],
      viewUp: [0, 0, -1]
    });
  });
});