import type { Coordinate } from "../../domain/coordinates";
import type { WellTrajectory } from "../domain/types";
import type { WellTrajectoryPickResult, WellTrajectoryRenderSettings } from "./types";

export interface TrajectoryPolylinePlan {
  readonly localPoints: Float32Array;
  /** vtk.js cell-array data containing one or more clipped polylines. */
  readonly vtkLines: Uint32Array;
}

export interface TrajectoryTickPlan {
  readonly localPoints: Float32Array;
  readonly vtkLines: Uint32Array;
}

/** Converts Float64 world trajectory coordinates to Float32 local render coordinates. */
export function createTrajectoryPolylinePlan(
  trajectory: WellTrajectory,
  localOrigin: Coordinate,
  clipBounds?: readonly [number, number, number, number, number, number]
): TrajectoryPolylinePlan {
  const points: number[] = [];
  const lines: number[] = [];
  if (!clipBounds) {
    for (let index = 0; index < trajectory.measuredDepths.length; index += 1) {
      appendStationPoint(points, trajectory.xyz, index, localOrigin);
    }
    lines.push(trajectory.measuredDepths.length, ...Array.from({ length: trajectory.measuredDepths.length }, (_, index) => index));
    return { localPoints: new Float32Array(points), vtkLines: new Uint32Array(lines) };
  }

  let pointIndex = 0;
  for (const sequence of clipTrajectorySegments(trajectory.xyz, clipBounds)) {
    const first = sequence[0];
    if (!first) {
      continue;
    }
    const lineStart = pointIndex;
    appendPoint(points, first[0], localOrigin);
    pointIndex += 1;
    for (const segment of sequence) {
      appendPoint(points, segment[1], localOrigin);
      pointIndex += 1;
    }
    const count = pointIndex - lineStart;
    lines.push(count, ...Array.from({ length: count }, (_, index) => lineStart + index));
  }
  return { localPoints: new Float32Array(points), vtkLines: new Uint32Array(lines) };
}

/** Creates short MD tick line segments at regular MD intervals along the stored survey path. */
export function createTrajectoryTickPlan(
  trajectory: WellTrajectory,
  localOrigin: Coordinate,
  interval: number,
  size: number
): TrajectoryTickPlan {
  if (!Number.isFinite(interval) || interval <= 0 || !Number.isFinite(size) || size <= 0) {
    return { localPoints: new Float32Array(), vtkLines: new Uint32Array() };
  }
  const points: number[] = [];
  const lines: number[] = [];
  const maximumMd = trajectory.measuredDepths[trajectory.measuredDepths.length - 1] ?? 0;
  let pointIndex = 0;
  for (let md = interval; md < maximumMd; md += interval) {
    const position = interpolateTrajectoryPosition(trajectory, md);
    if (!position) {
      continue;
    }
    points.push(position[0] - localOrigin[0] - size, position[1] - localOrigin[1], position[2] - localOrigin[2]);
    points.push(position[0] - localOrigin[0] + size, position[1] - localOrigin[1], position[2] - localOrigin[2]);
    lines.push(2, pointIndex, pointIndex + 1);
    pointIndex += 2;
  }
  return { localPoints: new Float32Array(points), vtkLines: new Uint32Array(lines) };
}

/** Finds the nearest raw trajectory station to a picked local rendering coordinate. */
export function findNearestTrajectoryStation(
  trajectory: WellTrajectory,
  localPosition: readonly [number, number, number],
  localOrigin: Coordinate
): WellTrajectoryPickResult {
  let stationIndex = 0;
  let minimumDistanceSquared = Number.POSITIVE_INFINITY;
  for (let index = 0; index < trajectory.measuredDepths.length; index += 1) {
    const offset = index * 3;
    const dx = (trajectory.xyz[offset] ?? 0) - localOrigin[0] - localPosition[0];
    const dy = (trajectory.xyz[offset + 1] ?? 0) - localOrigin[1] - localPosition[1];
    const dz = (trajectory.xyz[offset + 2] ?? 0) - localOrigin[2] - localPosition[2];
    const distanceSquared = dx * dx + dy * dy + dz * dz;
    if (distanceSquared < minimumDistanceSquared) {
      minimumDistanceSquared = distanceSquared;
      stationIndex = index;
    }
  }
  const offset = stationIndex * 3;
  return {
    wellId: trajectory.wellId,
    wellName: trajectory.wellName,
    stationIndex,
    measuredDepth: trajectory.measuredDepths[stationIndex] ?? 0,
    worldCoordinate: [trajectory.xyz[offset] ?? 0, trajectory.xyz[offset + 1] ?? 0, trajectory.xyz[offset + 2] ?? 0]
  };
}

export function defaultWellTrajectoryRenderSettings(wellId: string, color: readonly [number, number, number]): WellTrajectoryRenderSettings {
  return {
    wellId,
    visible: true,
    color,
    representation: "tube",
    radius: 0.35,
    showLabel: true,
    showMdTicks: false,
    mdTickInterval: 100,
    clipToReservoirBounds: false
  };
}

type ClippedSegment = readonly [readonly [number, number, number], readonly [number, number, number]];

function clipTrajectorySegments(xyz: Float64Array, bounds: readonly [number, number, number, number, number, number]): ClippedSegment[][] {
  const sequences: ClippedSegment[][] = [];
  let activeSequence: ClippedSegment[] | undefined;
  for (let index = 1; index < xyz.length / 3; index += 1) {
    const start = stationPoint(xyz, index - 1);
    const end = stationPoint(xyz, index);
    const clipped = clipSegmentToBounds(start, end, bounds);
    if (!clipped) {
      activeSequence = undefined;
      continue;
    }
    if (!activeSequence) {
      activeSequence = [];
      sequences.push(activeSequence);
    }
    activeSequence.push(clipped);
  }
  return sequences;
}

function clipSegmentToBounds(start: readonly [number, number, number], end: readonly [number, number, number], bounds: readonly [number, number, number, number, number, number]): readonly [readonly [number, number, number], readonly [number, number, number]] | undefined {
  let minimum = 0;
  let maximum = 1;
  for (const interval of [
    clipAxis(start[0], end[0] - start[0], bounds[0], bounds[1]),
    clipAxis(start[1], end[1] - start[1], bounds[2], bounds[3]),
    clipAxis(start[2], end[2] - start[2], bounds[4], bounds[5])
  ]) {
    if (!interval) {
      return undefined;
    }
    minimum = Math.max(minimum, interval[0]);
    maximum = Math.min(maximum, interval[1]);
    if (minimum > maximum) {
      return undefined;
    }
  }
  return [interpolatePoint(start, end, minimum), interpolatePoint(start, end, maximum)];
}

function clipAxis(value: number, delta: number, lower: number, upper: number): readonly [number, number] | undefined {
  if (delta === 0) {
    return value < lower || value > upper ? undefined : [0, 1];
  }
  const entry = (lower - value) / delta;
  const exit = (upper - value) / delta;
  return [Math.min(entry, exit), Math.max(entry, exit)];
}

function interpolateTrajectoryPosition(trajectory: WellTrajectory, measuredDepth: number): Coordinate | undefined {
  for (let index = 1; index < trajectory.measuredDepths.length; index += 1) {
    const currentMd = trajectory.measuredDepths[index] ?? Number.NaN;
    const previousMd = trajectory.measuredDepths[index - 1] ?? Number.NaN;
    if (measuredDepth > currentMd || measuredDepth < previousMd) {
      continue;
    }
    return interpolatePoint(stationPoint(trajectory.xyz, index - 1), stationPoint(trajectory.xyz, index), (measuredDepth - previousMd) / (currentMd - previousMd));
  }
  return undefined;
}

function appendStationPoint(points: number[], xyz: Float64Array, index: number, localOrigin: Coordinate): void {
  appendPoint(points, stationPoint(xyz, index), localOrigin);
}

function appendPoint(points: number[], point: readonly [number, number, number], localOrigin: Coordinate): void {
  points.push(point[0] - localOrigin[0], point[1] - localOrigin[1], point[2] - localOrigin[2]);
}

function stationPoint(xyz: Float64Array, index: number): Coordinate {
  const offset = index * 3;
  return [xyz[offset] ?? 0, xyz[offset + 1] ?? 0, xyz[offset + 2] ?? 0];
}

function interpolatePoint(start: readonly [number, number, number], end: readonly [number, number, number], fraction: number): Coordinate {
  return [
    start[0] + (end[0] - start[0]) * fraction,
    start[1] + (end[1] - start[1]) * fraction,
    start[2] + (end[2] - start[2]) * fraction
  ];
}