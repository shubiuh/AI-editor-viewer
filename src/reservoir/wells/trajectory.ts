import type {
  CoordinateReferenceSystem,
  DeviationSurveyStation,
  ExplicitWellTrajectoryStation,
  WellTrajectory,
  WellTrajectoryRawStation
} from "../domain/types";

export type AngleUnit = "degrees" | "radians";
export type LengthUnit = "metres" | "feet";
export type AzimuthConvention = "north-clockwise" | "east-counterclockwise";
export type NorthReference = "true" | "grid" | "magnetic";

export interface WellTrajectoryOptions {
  readonly wellId: string;
  readonly wellName: string;
  readonly lengthUnit: LengthUnit;
  readonly datum: string;
  readonly datumElevation: number;
  /** Surface easting, northing, and elevation in the declared length unit; elevation is positive up. */
  readonly surfaceLocation: readonly [number, number, number];
  readonly coordinateReferenceSystem: CoordinateReferenceSystem;
}

export interface DeviationSurveyOptions extends WellTrajectoryOptions {
  readonly angleUnit: AngleUnit;
  readonly azimuthConvention: AzimuthConvention;
  readonly northReference: NorthReference;
}

export interface ExplicitXyzStation {
  readonly measuredDepth: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface DeviationSurveyInputStation {
  readonly measuredDepth: number;
  readonly inclination: number;
  readonly azimuth: number;
}

export type WellTrajectoryErrorCode =
  | "invalid-options"
  | "invalid-station"
  | "invalid-measured-depth"
  | "invalid-csv";

export class WellTrajectoryError extends Error {
  public constructor(public readonly code: WellTrajectoryErrorCode, message: string) {
    super(message);
    this.name = "WellTrajectoryError";
  }
}

/**
 * Builds a trajectory from supplied xyz stations. Input xyz values use the declared length unit;
 * output xyz is Float64Array easting, northing, depth-positive-down in metres.
 */
export function createExplicitWellTrajectory(
  stations: readonly ExplicitXyzStation[],
  options: WellTrajectoryOptions
): WellTrajectory {
  validateBaseOptions(options);
  validateStations(stations, isExplicitStation);
  const factor = lengthFactor(options.lengthUnit);
  const measuredDepths = new Float64Array(stations.length);
  const xyz = new Float64Array(stations.length * 3);
  const rawStations: ExplicitWellTrajectoryStation[] = [];

  stations.forEach((station, index) => {
    measuredDepths[index] = station.measuredDepth * factor;
    xyz.set([station.x * factor, station.y * factor, station.z * factor], index * 3);
    rawStations.push({ kind: "explicit-xyz", ...station });
  });
  return createTrajectory(rawStations, measuredDepths, xyz, options);
}

/**
 * Builds a trajectory using the published minimum-curvature method. Inclination is from vertical;
 * azimuth is interpreted only according to the explicitly supplied convention.
 */
export function createMinimumCurvatureWellTrajectory(
  stations: readonly DeviationSurveyInputStation[],
  options: DeviationSurveyOptions
): WellTrajectory {
  validateBaseOptions(options);
  if (options.angleUnit !== "degrees" && options.angleUnit !== "radians") {
    throw new WellTrajectoryError("invalid-options", "Angle unit must be explicitly 'degrees' or 'radians'.");
  }
  validateStations(stations, isDeviationStation);
  const maximumInclination = options.angleUnit === "degrees" ? 180 : Math.PI;
  if (stations.some((station) => station.inclination < 0 || station.inclination > maximumInclination)) {
    throw new WellTrajectoryError("invalid-station", "Inclination must be within the physically possible range from 0 to 180 degrees.");
  }
  const factor = lengthFactor(options.lengthUnit);
  const angleFactor = options.angleUnit === "degrees" ? Math.PI / 180 : 1;
  const measuredDepths = new Float64Array(stations.length);
  const xyz = new Float64Array(stations.length * 3);
  const rawStations: DeviationSurveyStation[] = [];
  const [surfaceEast, surfaceNorth, surfaceElevation] = options.surfaceLocation;
  let east = surfaceEast * factor;
  let north = surfaceNorth * factor;
  let depth = (options.datumElevation - surfaceElevation) * factor;

  stations.forEach((station, index) => {
    measuredDepths[index] = station.measuredDepth * factor;
    rawStations.push({ kind: "deviation-survey", ...station });
    if (index > 0) {
      const previous = stations[index - 1];
      if (!previous) {
        throw new WellTrajectoryError("invalid-station", "Survey station is missing.");
      }
      const displacement = minimumCurvatureDisplacement(
        (station.measuredDepth - previous.measuredDepth) * factor,
        previous.inclination * angleFactor,
        previous.azimuth * angleFactor,
        station.inclination * angleFactor,
        station.azimuth * angleFactor,
        options.azimuthConvention
      );
      east += displacement.east;
      north += displacement.north;
      depth += displacement.depth;
    }
    xyz.set([east, north, depth], index * 3);
  });
  return createTrajectory(rawStations, measuredDepths, xyz, options);
}

/** Parses a headered CSV containing measured depth, inclination, and azimuth columns. */
export function parseDeviationSurveyCsv(csv: string): DeviationSurveyInputStation[] {
  const rows = csv.trim().split(/\r?\n/).filter((row) => row.trim());
  if (rows.length < 2) {
    throw new WellTrajectoryError("invalid-csv", "Deviation-survey CSV requires a header and at least one station.");
  }
  const headers = splitCsvRow(rows[0] ?? "").map((header) => header.trim().toLowerCase());
  const mdIndex = findColumn(headers, ["measured depth", "measured_depth", "md"]);
  const inclinationIndex = findColumn(headers, ["inclination", "inc"]);
  const azimuthIndex = findColumn(headers, ["azimuth", "azi"]);
  if (mdIndex === -1 || inclinationIndex === -1 || azimuthIndex === -1) {
    throw new WellTrajectoryError("invalid-csv", "CSV must contain measured depth, inclination, and azimuth columns.");
  }
  return rows.slice(1).map((row, rowIndex) => {
    const values = splitCsvRow(row);
    const station = {
      measuredDepth: Number(values[mdIndex]),
      inclination: Number(values[inclinationIndex]),
      azimuth: Number(values[azimuthIndex])
    };
    if (!isDeviationStation(station)) {
      throw new WellTrajectoryError("invalid-csv", `CSV row ${rowIndex + 2} contains a missing or non-finite survey value.`);
    }
    return station;
  });
}

function createTrajectory(rawStations: readonly WellTrajectoryRawStation[], measuredDepths: Float64Array, xyz: Float64Array, options: WellTrajectoryOptions): WellTrajectory {
  return {
    wellId: options.wellId,
    wellName: options.wellName,
    rawStations,
    measuredDepths,
    xyz,
    datum: options.datum,
    coordinateReferenceSystem: options.coordinateReferenceSystem,
    coordinateConvention: {
      axisOrder: "east-north-depth",
      verticalDirection: "positive-down",
      lengthUnit: "metre",
      depthReference: `Depth is positive down from datum elevation ${options.datumElevation} ${options.lengthUnit}.`,
      ...(isDeviationOptions(options) ? { azimuthConvention: options.azimuthConvention, northReference: options.northReference } : {})
    }
  };
}

function minimumCurvatureDisplacement(deltaMeasuredDepth: number, inclination1: number, azimuth1: number, inclination2: number, azimuth2: number, convention: AzimuthConvention) {
  const direction1 = directionCosines(inclination1, azimuth1, convention);
  const direction2 = directionCosines(inclination2, azimuth2, convention);
  const dotProduct = clamp(direction1.east * direction2.east + direction1.north * direction2.north + direction1.depth * direction2.depth, -1, 1);
  const dogleg = Math.acos(dotProduct);
  const ratioFactor = dogleg < 1e-8 ? 1 + dogleg * dogleg / 12 : 2 * Math.tan(dogleg / 2) / dogleg;
  const halfLength = deltaMeasuredDepth * ratioFactor / 2;
  return {
    east: halfLength * (direction1.east + direction2.east),
    north: halfLength * (direction1.north + direction2.north),
    depth: halfLength * (direction1.depth + direction2.depth)
  };
}

function directionCosines(inclination: number, azimuth: number, convention: AzimuthConvention) {
  const horizontal = Math.sin(inclination);
  return convention === "north-clockwise"
    ? { east: horizontal * Math.sin(azimuth), north: horizontal * Math.cos(azimuth), depth: Math.cos(inclination) }
    : { east: horizontal * Math.cos(azimuth), north: horizontal * Math.sin(azimuth), depth: Math.cos(inclination) };
}

function validateBaseOptions(options: WellTrajectoryOptions): void {
  if (!options.wellId.trim() || !options.wellName.trim() || !options.datum.trim() || !isFiniteTuple(options.surfaceLocation) || !Number.isFinite(options.datumElevation)) {
    throw new WellTrajectoryError("invalid-options", "Well identity, datum, datum elevation, and surface location must be finite and non-empty.");
  }
  if (options.lengthUnit !== "metres" && options.lengthUnit !== "feet") {
    throw new WellTrajectoryError("invalid-options", "Length unit must be explicitly 'metres' or 'feet'.");
  }
}

function validateStations<T>(stations: readonly T[], guard: (station: T) => boolean): void {
  if (stations.length === 0) {
    throw new WellTrajectoryError("invalid-station", "A trajectory requires at least one survey station.");
  }
  stations.forEach((station, index) => {
    if (!guard(station)) {
      throw new WellTrajectoryError("invalid-station", `Station ${index + 1} contains a non-finite value.`);
    }
    const measuredDepth = (station as { measuredDepth: number }).measuredDepth;
    if (measuredDepth < 0 || index > 0 && measuredDepth <= (stations[index - 1] as { measuredDepth: number }).measuredDepth) {
      throw new WellTrajectoryError("invalid-measured-depth", "Measured depth must be non-negative and strictly increasing.");
    }
  });
}

function isExplicitStation(value: unknown): value is ExplicitXyzStation {
  return isFiniteRecord(value, ["measuredDepth", "x", "y", "z"]);
}

function isDeviationStation(value: unknown): value is DeviationSurveyInputStation {
  return isFiniteRecord(value, ["measuredDepth", "inclination", "azimuth"]);
}

function isFiniteRecord(value: unknown, keys: readonly string[]): boolean {
  return typeof value === "object" && value !== null && keys.every((key) => Number.isFinite((value as Record<string, unknown>)[key]));
}

function isFiniteTuple(value: readonly number[]): boolean {
  return value.length === 3 && value.every((component) => Number.isFinite(component));
}

function isDeviationOptions(options: WellTrajectoryOptions): options is DeviationSurveyOptions {
  return "angleUnit" in options;
}

function lengthFactor(unit: LengthUnit): number {
  return unit === "metres" ? 1 : 0.3048;
}

function findColumn(headers: readonly string[], names: readonly string[]): number {
  return headers.findIndex((header) => names.includes(header));
}

function splitCsvRow(row: string): string[] {
  return row.split(",").map((value) => value.trim());
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}