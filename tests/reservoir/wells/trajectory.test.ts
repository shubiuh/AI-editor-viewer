import { describe, expect, it } from "vitest";

import {
  createExplicitWellTrajectory,
  createMinimumCurvatureWellTrajectory,
  parseDeviationSurveyCsv,
  WellTrajectoryError
} from "../../../src/reservoir/wells";

const coordinateReferenceSystem = { kind: "local" as const, name: "Survey local" };

const baseOptions = {
  wellId: "well-a",
  wellName: "Well A",
  lengthUnit: "metres" as const,
  datum: "KB",
  datumElevation: 100,
  surfaceLocation: [1000, 2000, 95] as const,
  coordinateReferenceSystem
};

const deviationOptions = {
  ...baseOptions,
  angleUnit: "degrees" as const,
  azimuthConvention: "north-clockwise" as const,
  northReference: "grid" as const
};

function expectCoordinates(actual: Float64Array, expected: readonly number[], precision = 10): void {
  expect(Array.from(actual)).toHaveLength(expected.length);
  expected.forEach((value, index) => expect(actual[index]).toBeCloseTo(value, precision));
}

describe("well trajectories", () => {
  it("keeps explicit xyz stations and converts feet to Float64 metre arrays", () => {
    const trajectory = createExplicitWellTrajectory([
      { measuredDepth: 0, x: 0, y: 0, z: 0 },
      { measuredDepth: 100, x: 10, y: 20, z: 100 }
    ], { ...baseOptions, lengthUnit: "feet" });

    expect(trajectory.measuredDepths).toBeInstanceOf(Float64Array);
    expect(trajectory.xyz).toBeInstanceOf(Float64Array);
    expectCoordinates(trajectory.measuredDepths, [0, 30.48]);
    expectCoordinates(trajectory.xyz, [0, 0, 0, 3.048, 6.096, 30.48]);
    expect(trajectory.rawStations).toEqual([
      { kind: "explicit-xyz", measuredDepth: 0, x: 0, y: 0, z: 0 },
      { kind: "explicit-xyz", measuredDepth: 100, x: 10, y: 20, z: 100 }
    ]);
  });

  it("calculates a vertical well from the datum-relative surface location", () => {
    const trajectory = createMinimumCurvatureWellTrajectory([
      { measuredDepth: 0, inclination: 0, azimuth: 0 },
      { measuredDepth: 100, inclination: 0, azimuth: 0 }
    ], deviationOptions);

    expectCoordinates(trajectory.measuredDepths, [0, 100]);
    expectCoordinates(trajectory.xyz, [1000, 2000, 5, 1000, 2000, 105]);
  });

  it("calculates a straight 30-degree eastward well", () => {
    const trajectory = createMinimumCurvatureWellTrajectory([
      { measuredDepth: 0, inclination: 30, azimuth: 90 },
      { measuredDepth: 100, inclination: 30, azimuth: 90 }
    ], deviationOptions);

    expectCoordinates(trajectory.xyz, [1000, 2000, 5, 1050, 2000, 91.60254037844386]);
  });

  it("matches the analytic circular-arc result for a constant build", () => {
    const trajectory = createMinimumCurvatureWellTrajectory([
      { measuredDepth: 0, inclination: 0, azimuth: 0 },
      { measuredDepth: 100, inclination: 30, azimuth: 0 }
    ], deviationOptions);
    const radius = 100 / (Math.PI / 6);

    expectCoordinates(trajectory.xyz, [
      1000, 2000, 5,
      1000, 2000 + radius * (1 - Math.cos(Math.PI / 6)), 5 + radius * Math.sin(Math.PI / 6)
    ]);
  });

  it("matches the spreadsheet minimum-curvature result for a 90-degree azimuth change", () => {
    const trajectory = createMinimumCurvatureWellTrajectory([
      { measuredDepth: 0, inclination: 90, azimuth: 0 },
      { measuredDepth: 100, inclination: 90, azimuth: 90 }
    ], deviationOptions);
    const offset = 200 / Math.PI;

    expectCoordinates(trajectory.xyz, [1000, 2000, 5, 1000 + offset, 2000 + offset, 5]);
  });

  it("uses a stable unit ratio factor for zero dogleg", () => {
    const trajectory = createMinimumCurvatureWellTrajectory([
      { measuredDepth: 0, inclination: 60, azimuth: 90 },
      { measuredDepth: 100, inclination: 60, azimuth: 90 }
    ], deviationOptions);

    expectCoordinates(trajectory.xyz, [1000, 2000, 5, 1086.6025403784438, 2000, 55]);
  });

  it("parses a headered deviation-survey CSV without inferring angle units", () => {
    const stations = parseDeviationSurveyCsv("MD,INC,AZI\n0,0,0\n100,30,90\n");
    const trajectory = createMinimumCurvatureWellTrajectory(stations, deviationOptions);

    expect(stations).toEqual([{ measuredDepth: 0, inclination: 0, azimuth: 0 }, { measuredDepth: 100, inclination: 30, azimuth: 90 }]);
    expectCoordinates(trajectory.xyz, [1000, 2000, 5, 1025.5872630837368, 2000, 100.4929658551372]);
  });

  it("rejects duplicate and decreasing measured depths", () => {
    expect(() => createMinimumCurvatureWellTrajectory([
      { measuredDepth: 0, inclination: 0, azimuth: 0 },
      { measuredDepth: 0, inclination: 0, azimuth: 0 }
    ], deviationOptions)).toThrow(expect.objectContaining({ code: "invalid-measured-depth" } satisfies Partial<WellTrajectoryError>));
    expect(() => createMinimumCurvatureWellTrajectory([
      { measuredDepth: 100, inclination: 0, azimuth: 0 },
      { measuredDepth: 50, inclination: 0, azimuth: 0 }
    ], deviationOptions)).toThrow(expect.objectContaining({ code: "invalid-measured-depth" } satisfies Partial<WellTrajectoryError>));
  });

  it("rejects non-finite and physically impossible survey values", () => {
    expect(() => createMinimumCurvatureWellTrajectory([
      { measuredDepth: 0, inclination: 0, azimuth: 0 },
      { measuredDepth: Number.NaN, inclination: 0, azimuth: 0 }
    ], deviationOptions)).toThrow(expect.objectContaining({ code: "invalid-station" } satisfies Partial<WellTrajectoryError>));
    expect(() => createMinimumCurvatureWellTrajectory([
      { measuredDepth: 0, inclination: 181, azimuth: 0 }
    ], deviationOptions)).toThrow(expect.objectContaining({ code: "invalid-station" } satisfies Partial<WellTrajectoryError>));
  });
});