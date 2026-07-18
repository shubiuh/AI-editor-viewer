import type { WellLogCurve } from "../domain/types";

export type WellLogDepthMode = "md" | "tvd";
export type WellLogHorizontalScale = "linear" | "logarithmic";

export interface WellLogPlotCurve {
  readonly curve: WellLogCurve;
  /** Optional converted TVD values, supplied outside the renderer-independent WellLogCurve domain. */
  readonly tvdDepths?: Float64Array;
  readonly color: readonly [number, number, number];
}

export interface WellLogValueRange {
  readonly minimum: number;
  readonly maximum: number;
}

export interface WellLogCurveSegment {
  readonly start: number;
  readonly end: number;
}

export function validateHorizontalScaleRange(range: WellLogValueRange, scale: WellLogHorizontalScale): void {
  if (!Number.isFinite(range.minimum) || !Number.isFinite(range.maximum) || range.maximum <= range.minimum) {
    throw new Error("Curve range must contain finite ascending values.");
  }
  if (scale === "logarithmic" && range.minimum <= 0) {
    throw new Error("A logarithmic curve range must have a positive minimum.");
  }
}

export function valueToTrackFraction(value: number, range: WellLogValueRange, scale: WellLogHorizontalScale): number | undefined {
  if (!Number.isFinite(value)) {
    return undefined;
  }
  validateHorizontalScaleRange(range, scale);
  if (scale === "logarithmic") {
    if (value <= 0) {
      return undefined;
    }
    return (Math.log10(value) - Math.log10(range.minimum)) / (Math.log10(range.maximum) - Math.log10(range.minimum));
  }
  return (value - range.minimum) / (range.maximum - range.minimum);
}

export function depthValuesForMode(curve: WellLogPlotCurve, mode: WellLogDepthMode): Float64Array {
  if (mode === "md") {
    return curve.curve.depths;
  }
  if (!curve.tvdDepths || curve.tvdDepths.length !== curve.curve.depths.length) {
    throw new Error(`Curve ${curve.curve.mnemonic} has no compatible TVD conversion data.`);
  }
  return curve.tvdDepths;
}

export function supportsDepthMode(curves: readonly WellLogPlotCurve[], mode: WellLogDepthMode): boolean {
  return mode === "md" || curves.length > 0 && curves.every((curve) => curve.tvdDepths?.length === curve.curve.depths.length);
}

/** Returns inclusive index intervals that can be drawn without bridging null/invalid gaps. */
export function segmentCurveForDepthRange(
  curve: WellLogCurve,
  depths: Float64Array,
  depthRange: WellLogValueRange
): readonly WellLogCurveSegment[] {
  if (depths.length !== curve.values.length) {
    throw new Error("Curve depth and value arrays must have equal lengths.");
  }
  const segments: WellLogCurveSegment[] = [];
  let start: number | undefined;
  let previous: number | undefined;
  for (let index = 0; index < depths.length; index += 1) {
    const depth = depths[index];
    const value = curve.values[index];
    const valid = depth !== undefined && value !== undefined && Number.isFinite(depth) && Number.isFinite(value)
      && curve.validityMask?.[index] !== 0
      && depth >= depthRange.minimum && depth <= depthRange.maximum;
    if (valid) {
      start ??= index;
      previous = index;
      continue;
    }
    if (start !== undefined && previous !== undefined) {
      segments.push({ start, end: previous });
    }
    start = undefined;
    previous = undefined;
  }
  if (start !== undefined && previous !== undefined) {
    segments.push({ start, end: previous });
  }
  return segments;
}

export function curveValueRange(curve: WellLogCurve): WellLogValueRange {
  let minimum = Number.POSITIVE_INFINITY;
  let maximum = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < curve.values.length; index += 1) {
    const value = curve.values[index];
    if (curve.validityMask?.[index] === 0 || value === undefined || !Number.isFinite(value)) {
      continue;
    }
    minimum = Math.min(minimum, value);
    maximum = Math.max(maximum, value);
  }
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum)) {
    return { minimum: 0, maximum: 1 };
  }
  if (minimum === maximum) {
    const padding = Math.max(Math.abs(minimum) * 0.1, 1);
    return { minimum: minimum - padding, maximum: maximum + padding };
  }
  return { minimum, maximum };
}

export function depthRangeForCurves(curves: readonly WellLogPlotCurve[], mode: WellLogDepthMode): WellLogValueRange | undefined {
  let minimum = Number.POSITIVE_INFINITY;
  let maximum = Number.NEGATIVE_INFINITY;
  for (const curve of curves) {
    for (const depth of depthValuesForMode(curve, mode)) {
      if (Number.isFinite(depth)) {
        minimum = Math.min(minimum, depth);
        maximum = Math.max(maximum, depth);
      }
    }
  }
  return Number.isFinite(minimum) && Number.isFinite(maximum) ? { minimum, maximum } : undefined;
}

export function formatCurveRange(range: WellLogValueRange, symbol: string): string {
  validateHorizontalScaleRange(range, "linear");
  return `${formatNumber(range.minimum)} to ${formatNumber(range.maximum)} ${symbol}`;
}

function formatNumber(value: number): string {
  const magnitude = Math.abs(value);
  if (magnitude !== 0 && (magnitude >= 10_000 || magnitude < 0.01)) {
    return value.toExponential(2);
  }
  return value.toFixed(magnitude >= 100 ? 0 : magnitude >= 10 ? 1 : 2);
}