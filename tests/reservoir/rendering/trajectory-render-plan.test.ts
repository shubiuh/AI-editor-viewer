import { describe, expect, it } from "vitest";

import type { WellTrajectory } from "../../../src/reservoir/domain/types";
import { createTrajectoryPolylinePlan, findNearestTrajectoryStation } from "../../../src/reservoir/rendering/trajectory-render-plan";

function trajectory(): WellTrajectory {
  return {
    wellId: "synthetic-a",
    wellName: "Synthetic A",
    rawStations: [
      { kind: "explicit-xyz", measuredDepth: 0, x: 95, y: 205, z: 1001 },
      { kind: "explicit-xyz", measuredDepth: 100, x: 115, y: 205, z: 1005 },
      { kind: "explicit-xyz", measuredDepth: 200, x: 135, y: 205, z: 1009 }
    ],
    measuredDepths: new Float64Array([0, 100, 200]),
    xyz: new Float64Array([95, 205, 1001, 115, 205, 1005, 135, 205, 1009]),
    datum: "KB",
    coordinateReferenceSystem: { kind: "local", name: "Synthetic local" },
    coordinateConvention: {
      axisOrder: "east-north-depth",
      verticalDirection: "positive-down",
      lengthUnit: "metre",
      depthReference: "Synthetic datum"
    }
  };
}

describe("trajectory rendering plan", () => {
  it("converts Float64 world trajectory coordinates to local Float32 coordinates and clips crossing segments", () => {
    const plan = createTrajectoryPolylinePlan(trajectory(), [100, 200, 1000], [100, 130, 200, 210, 1000, 1010]);

    expect(plan.localPoints).toBeInstanceOf(Float32Array);
    expect(Array.from(plan.localPoints)).toEqual([0, 5, 2, 15, 5, 5, 30, 5, 8]);
    expect(Array.from(plan.vtkLines)).toEqual([3, 0, 1, 2]);
  });

  it("returns the nearest stored survey station with MD and reconstructed Float64 world coordinates", () => {
    const picked = findNearestTrajectoryStation(trajectory(), [14.7, 5.1, 4.8], [100, 200, 1000]);

    expect(picked).toEqual({
      wellId: "synthetic-a",
      wellName: "Synthetic A",
      stationIndex: 1,
      measuredDepth: 100,
      worldCoordinate: [115, 205, 1005]
    });
  });
});