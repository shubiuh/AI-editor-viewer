import { err, ok, type Result } from "../../domain/result";
import { validateUnitMetadata } from "../../domain/units";
import { validateReservoirGrid, type ReservoirValidationError } from "./grid-validation";
import type { CaseMetadata, ReservoirCase } from "./types";

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

  return ok(reservoirCase);
}

function invalid(code: string, message: string): Result<never, ReservoirValidationError> {
  return err({ code, message });
}