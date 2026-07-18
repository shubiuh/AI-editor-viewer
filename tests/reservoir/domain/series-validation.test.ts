import { describe, expect, it } from "vitest";

import { isErr, isOk } from "../../../src/domain/result";
import {
  validatePropertyFrame,
  validateWellLogCurve,
  validateWellTrajectory
} from "../../../src/reservoir/domain/series-validation";

const metre = {
  id: "metre",
  label: "Metre",
  symbol: "m",
  dimension: "length" as const,
  toBaseFactor: 1
};

describe("reservoir time-series validation", () => {
  it("validates property-frame tuple and mask lengths", () => {
    const frame = {
      propertyId: "poro",
      timeStepIndex: 0,
      time: { kind: "simulation-time" as const, value: 0, unit: metre },
      values: new Float32Array([0.1, 0.2]),
      validityMask: new Uint8Array([1, 1])
    };

    expect(isOk(validatePropertyFrame(frame, 2))).toBe(true);
    expect(isErr(validatePropertyFrame({ ...frame, validityMask: new Uint8Array([1]) }, 2))).toBe(true);
  });

  it("validates typed trajectory and log curve lengths", () => {
    const trajectory = {
      wellId: "well-a",
      wellName: "Well A",
      rawStations: [
        { kind: "explicit-xyz" as const, measuredDepth: 0, x: 0, y: 0, z: 0 },
        { kind: "explicit-xyz" as const, measuredDepth: 100, x: 10, y: 20, z: 100 }
      ],
      measuredDepths: new Float64Array([0, 100]),
      xyz: new Float64Array([0, 0, 0, 10, 20, 100]),
      datum: "KB",
      coordinateReferenceSystem: { kind: "local" as const, name: "Case local" },
      coordinateConvention: {
        axisOrder: "east-north-depth" as const,
        verticalDirection: "positive-down" as const,
        lengthUnit: "metre" as const,
        depthReference: "KB"
      }
    };
    const curve = {
      wellId: "well-a",
      mnemonic: "GR",
      unit: metre,
      description: "Synthetic curve",
      depthReference: "MD",
      depths: new Float64Array([0, 100]),
      values: new Float32Array([10, 20]),
      nullValue: null
    };

    expect(isOk(validateWellTrajectory(trajectory))).toBe(true);
    expect(isOk(validateWellLogCurve(curve))).toBe(true);
    expect(isErr(validateWellTrajectory({ ...trajectory, xyz: new Float64Array(3) }))).toBe(true);
  });
});