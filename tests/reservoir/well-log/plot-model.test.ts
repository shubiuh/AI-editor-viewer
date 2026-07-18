import { describe, expect, it } from "vitest";

import type { WellLogCurve } from "../../../src/reservoir/domain/types";
import {
  depthValuesForMode,
  formatCurveRange,
  segmentCurveForDepthRange,
  supportsDepthMode,
  validateHorizontalScaleRange,
  valueToTrackFraction,
  type WellLogPlotCurve
} from "../../../src/reservoir/well-log/plot-model";
import { SelectedDepthController } from "../../../src/reservoir/well-log/selected-depth-controller";

function curve(values = new Float64Array([1, Number.NaN, 3, 4, 5])): WellLogCurve {
  return {
    wellId: "synthetic-log",
    mnemonic: "GR",
    unit: { id: "api", label: "API", symbol: "API", dimension: "dimensionless", toBaseFactor: 1 },
    description: "Synthetic gamma ray",
    depthReference: "MD",
    depths: new Float64Array([0, 10, 20, 30, 40]),
    values,
    nullValue: -999.25,
    validityMask: new Uint8Array([1, 0, 1, 1, 1])
  };
}

describe("well-log plot model", () => {
  it("validates logarithmic horizontal ranges and maps positive values", () => {
    expect(() => validateHorizontalScaleRange({ minimum: 0, maximum: 100 }, "logarithmic")).toThrow("positive minimum");
    expect(valueToTrackFraction(10, { minimum: 1, maximum: 100 }, "logarithmic")).toBeCloseTo(0.5);
    expect(valueToTrackFraction(-1, { minimum: 1, maximum: 100 }, "logarithmic")).toBeUndefined();
  });

  it("segments curves at null gaps without joining them", () => {
    expect(segmentCurveForDepthRange(curve(), curve().depths, { minimum: 0, maximum: 40 })).toEqual([
      { start: 0, end: 0 },
      { start: 2, end: 4 }
    ]);
  });

  it("clips visible segments to the selected depth range", () => {
    const source = curve(new Float64Array([1, 2, 3, 4, 5]));

    expect(segmentCurveForDepthRange(source, source.depths, { minimum: 12, maximum: 35 })).toEqual([{ start: 2, end: 3 }]);
  });

  it("allows TVD only when compatible conversion arrays exist", () => {
    const source: WellLogPlotCurve = { curve: curve(), color: [1, 0, 0] };
    const converted: WellLogPlotCurve = { ...source, tvdDepths: new Float64Array([0, 9, 18, 27, 36]) };

    expect(supportsDepthMode([source], "tvd")).toBe(false);
    expect(supportsDepthMode([converted], "tvd")).toBe(true);
    expect(depthValuesForMode(converted, "tvd")).toEqual(new Float64Array([0, 9, 18, 27, 36]));
  });

  it("formats configured ranges with unit labels", () => {
    expect(formatCurveRange({ minimum: 12.345, maximum: 98.765 }, "API")).toBe("12.3 to 98.8 API");
    expect(formatCurveRange({ minimum: 1000, maximum: 2000 }, "ohm.m")).toBe("1000 to 2000 ohm.m");
  });

  it("synchronizes typed selected-depth events between subscribers", () => {
    const controller = new SelectedDepthController();
    const events: string[] = [];
    const unsubscribe = controller.subscribe((event) => events.push(`${event.source}:${event.depthMode}:${event.depth}`));
    controller.subscribe((event) => events.push(`mirror:${event.depth}`));

    controller.set({ source: "well-log", depthMode: "md", depth: 1234.5 });
    unsubscribe();
    controller.set({ source: "reservoir", depthMode: "md", depth: 1240 });

    expect(events).toEqual(["well-log:md:1234.5", "mirror:1234.5", "mirror:1240"]);
    expect(controller.get()).toEqual({ source: "reservoir", depthMode: "md", depth: 1240 });
  });
});