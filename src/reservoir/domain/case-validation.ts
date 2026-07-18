import { err, ok, type Result } from "../../domain/result";
import { validateUnitMetadata } from "../../domain/units";
import { validateReservoirGrid, type ReservoirValidationError } from "./grid-validation";
import type { CaseMetadata, ReservoirCase, WellTrajectory } from "./types";

export function isCompatibleReservoirSchemaVersion(version: string): boolean {
  return /^1\.\d+\.\d+$/.test(version);
}

export function validateCaseMetadata(
  metadata: CaseMetadata
): Result<CaseMetadata, ReservoirValidationError> {
  if (!isCompatibleReservoirSchemaVersion(metadata.schemaVersion)) {
    return invalid("unsupported-schema-version", "Only reservoir contract major version 1 is supported.");
  }

  if (!metadata.caseId.trim() || !metadata.caseName.trim() || !metadata.sourceFormat.name.trim()) {
    return invalid("invalid-case-metadata", "Case ID, name, and source format name must be non-empty.");
  }

  if (!metadata.coordinateReferenceSystem.name.trim() || !metadata.creation.createdAt.trim()) {
    return invalid("invalid-case-metadata", "Coordinate reference system and creation time must be non-empty.");
  }

  if (!metadata.localOrigin.every((value) => Number.isFinite(value))) {
    return invalid("invalid-local-origin", "Local origin must contain finite xyz coordinates.");
  }

  for (const unit of metadata.units) {
    if (!validateUnitMetadata(unit).ok) {
      return invalid("invalid-unit-metadata", "Case metadata contains invalid unit metadata.");
    }
  }

  return ok(metadata);
}

export function validateReservoirCase(
  reservoirCase: ReservoirCase
): Result<ReservoirCase, ReservoirValidationError> {
  const metadata = validateCaseMetadata(reservoirCase.metadata);
  if (!metadata.ok) {
    return metadata;
  }

  if (reservoirCase.grids.length === 0) {
    return invalid("missing-grids", "A reservoir case must include at least one grid.");
  }

  const gridIds = new Set<string>();
  for (const grid of reservoirCase.grids) {
    if (gridIds.has(grid.gridId)) {
      return invalid("duplicate-grid-id", "Grid IDs must be unique within a reservoir case.");
    }
    gridIds.add(grid.gridId);

    const validatedGrid = validateReservoirGrid(grid);
    if (!validatedGrid.ok) {
      return validatedGrid;
    }
  }

  const wellIds = new Set<string>();
  for (const well of reservoirCase.wells) {
    if (wellIds.has(well.wellId)) {
      return invalid("duplicate-well-id", "Well IDs must be unique within a reservoir case.");
    }
    wellIds.add(well.wellId);

    const validatedWell = validateWellTrajectory(well);
    if (!validatedWell.ok) {
      return validatedWell;
    }
  }

  return ok(reservoirCase);
}

function validateWellTrajectory(well: WellTrajectory): Result<WellTrajectory, ReservoirValidationError> {
  if (!well.wellId.trim() || !well.wellName.trim() || !well.datum.trim()) {
    return invalid("invalid-well-trajectory", "Well ID, name, and datum must be non-empty.");
  }
  if (!(well.measuredDepths instanceof Float64Array) || !(well.xyz instanceof Float64Array)) {
    return invalid("invalid-well-trajectory", "Well measured depths and xyz coordinates must be Float64Array values.");
  }
  if (well.measuredDepths.length === 0 || well.xyz.length !== well.measuredDepths.length * 3 || well.rawStations.length !== well.measuredDepths.length) {
    return invalid("invalid-well-trajectory", "Well trajectory station arrays must have matching non-zero lengths.");
  }
  for (let index = 0; index < well.measuredDepths.length; index += 1) {
    const measuredDepth = well.measuredDepths[index];
    if (measuredDepth === undefined || !Number.isFinite(measuredDepth) || measuredDepth < 0 || index > 0 && measuredDepth <= (well.measuredDepths[index - 1] ?? Number.POSITIVE_INFINITY)) {
      return invalid("invalid-well-trajectory", "Well measured depths must be finite, non-negative, and strictly increasing.");
    }
  }
  for (const coordinate of well.xyz) {
    if (!Number.isFinite(coordinate)) {
      return invalid("invalid-well-trajectory", "Well xyz coordinates must be finite.");
    }
  }
  return ok(well);
}

function invalid(code: string, message: string): Result<never, ReservoirValidationError> {
  return err({ code, message });
}