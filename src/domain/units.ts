import { err, ok, type Result } from "./result";

export const unitDimensions = [
  "dimensionless",
  "length",
  "pressure",
  "temperature",
  "volume"
] as const;

export type UnitDimension = (typeof unitDimensions)[number];

export interface UnitMetadata {
  readonly id: string;
  readonly label: string;
  readonly symbol: string;
  readonly dimension: UnitDimension;
  readonly toBaseFactor: number;
  readonly offset?: number;
}

export interface UnitMetadataValidationError {
  readonly code: "invalid-unit-metadata";
  readonly message: string;
}

export function validateUnitMetadata(
  candidate: unknown
): Result<UnitMetadata, UnitMetadataValidationError> {
  if (!isRecord(candidate)) {
    return invalid("Unit metadata must be an object.");
  }

  const id = readNonEmptyText(candidate.id);
  const label = readNonEmptyText(candidate.label);
  const symbol = readNonEmptyText(candidate.symbol);
  const dimension = candidate.dimension;
  const toBaseFactor = candidate.toBaseFactor;
  const offset = candidate.offset;

  if (!id || !label || !symbol) {
    return invalid("Unit metadata requires non-empty id, label, and symbol values.");
  }

  if (!isUnitDimension(dimension)) {
    return invalid("Unit metadata has an unsupported dimension.");
  }

  if (typeof toBaseFactor !== "number" || !Number.isFinite(toBaseFactor) || toBaseFactor <= 0) {
    return invalid("Unit metadata requires a positive finite toBaseFactor.");
  }

  if (offset !== undefined && (typeof offset !== "number" || !Number.isFinite(offset))) {
    return invalid("Unit metadata offset must be finite when supplied.");
  }

  return ok({
    id,
    label,
    symbol,
    dimension,
    toBaseFactor,
    ...(offset === undefined ? {} : { offset })
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readNonEmptyText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const text = value.trim();
  return text ? text : undefined;
}

function isUnitDimension(value: unknown): value is UnitDimension {
  return typeof value === "string" && unitDimensions.includes(value as UnitDimension);
}

function invalid(message: string): Result<never, UnitMetadataValidationError> {
  return err({ code: "invalid-unit-metadata", message });
}