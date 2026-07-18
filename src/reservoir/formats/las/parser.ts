import type { UnitMetadata } from "../../../domain/units";
import type { WellLogCurve } from "../../domain/types";

const defaultLimits: LasParserLimits = { maxRows: 5_000_000, maxCurves: 512 };

export interface LasParserLimits {
  readonly maxRows: number;
  readonly maxCurves: number;
}

export interface LasParserOptions {
  readonly wellId?: string;
  readonly limits?: Partial<LasParserLimits>;
  readonly signal?: AbortSignal;
  /** Called at every input line and parsed row so callers can cancel large imports. */
  readonly shouldCancel?: () => boolean;
}

export interface LasMetadataField {
  readonly mnemonic: string;
  readonly unit: string;
  readonly value: string;
  readonly description: string;
  readonly line: number;
  readonly raw: string;
}

export interface LasPreservedSection {
  readonly name: string;
  readonly line: number;
  readonly rawHeader: string;
  readonly lines: readonly string[];
  readonly fields: readonly LasMetadataField[];
}

export interface LasParseMetadata {
  readonly sections: readonly LasPreservedSection[];
  readonly version: readonly LasMetadataField[];
  readonly well: readonly LasMetadataField[];
  readonly curves: readonly LasMetadataField[];
  readonly parameters: readonly LasMetadataField[];
  readonly other: readonly LasPreservedSection[];
  readonly versionNumber: string;
  readonly wrapped: boolean;
  readonly nullValue: number | null;
  readonly depthCurve: LasMetadataField;
}

export interface LasParseResult {
  readonly wellId: string;
  readonly curves: readonly WellLogCurve[];
  readonly metadata: LasParseMetadata;
}

export type LasParseErrorCode =
  | "cancelled"
  | "missing-version-section"
  | "unsupported-version"
  | "missing-ascii-section"
  | "missing-curve-section"
  | "missing-depth-curve"
  | "duplicate-mnemonic"
  | "invalid-metadata"
  | "invalid-number"
  | "invalid-row"
  | "inconsistent-row"
  | "row-limit"
  | "curve-limit";

export class LasParseError extends Error {
  public constructor(public readonly code: LasParseErrorCode, public readonly line: number, message: string) {
    super(`LAS line ${line}: ${message}`);
    this.name = "LasParseError";
  }
}

/**
 * Parses the CWLS LAS 2.0 textual sections needed by this repository. Values retain source units;
 * LAS NULL values are encoded as NaN with a zero validity-mask entry in each output curve.
 */
export function parseLas2(text: string, options: LasParserOptions = {}): LasParseResult {
  const limits = { ...defaultLimits, ...options.limits };
  validateLimits(limits);
  const shouldCancel = () => options.signal?.aborted === true || options.shouldCancel?.() === true;
  const sections = readSections(text, shouldCancel);
  const versionSection = findSection(sections, "version");
  if (!versionSection) {
    throw new LasParseError("missing-version-section", 1, "A ~Version section is required for LAS 2.0.");
  }
  const version = versionSection.fields;
  const versionField = findField(version, "VERS");
  if (!versionField) {
    throw new LasParseError("invalid-metadata", versionSection.line, "The ~Version section must contain VERS.");
  }
  if (!/^2(?:\.\d+)?$/.test(versionField.value.trim())) {
    throw new LasParseError("unsupported-version", versionField.line, `Only LAS 2.x is supported; received '${versionField.value}'.`);
  }
  const curveSection = findSection(sections, "curve");
  if (!curveSection) {
    throw new LasParseError("missing-curve-section", 1, "A ~Curve section is required.");
  }
  if (curveSection.fields.length === 0) {
    throw new LasParseError("missing-curve-section", curveSection.line, "The ~Curve section has no curve definitions.");
  }
  if (curveSection.fields.length > limits.maxCurves) {
    throw new LasParseError("curve-limit", curveSection.line, `Curve count exceeds the configured limit of ${limits.maxCurves}.`);
  }
  validateUniqueMnemonics(curveSection.fields);
  const asciiSection = findSection(sections, "ascii");
  if (!asciiSection) {
    throw new LasParseError("missing-ascii-section", 1, "An ~ASCII data section is required.");
  }

  const wellSection = findSection(sections, "well");
  const nullField = findField(wellSection?.fields ?? [], "NULL");
  const nullValue = nullField ? parseFiniteNumber(nullField.value, nullField.line, "NULL value") : null;
  const wrapField = findField(version, "WRAP");
  const wrapped = wrapField ? parseWrapValue(wrapField) : false;
  const depthCurve = identifyDepthCurve(curveSection.fields);
  const depthCurveIndex = curveSection.fields.indexOf(depthCurve);
  const rows = readDataRows(asciiSection, curveSection.fields.length, wrapped, limits.maxRows, shouldCancel);
  const depths = new Float64Array(rows.length);
  const valuesByCurve = curveSection.fields.map(() => new Float64Array(rows.length));
  const masksByCurve = curveSection.fields.map(() => new Uint8Array(rows.length).fill(1));

  rows.forEach((row, rowIndex) => {
    for (let column = 0; column < row.values.length; column += 1) {
      const numeric = parseFiniteNumber(row.values[column] ?? "", row.line, `column ${column + 1}`);
      if (column === depthCurveIndex) {
        if (nullValue !== null && numeric === nullValue) {
          throw new LasParseError("invalid-row", row.line, "The depth curve cannot contain the LAS NULL value.");
        }
        depths[rowIndex] = numeric;
        continue;
      }
      const values = valuesByCurve[column];
      const mask = masksByCurve[column];
      if (!values || !mask) {
        throw new LasParseError("invalid-row", row.line, "Curve column allocation failed.");
      }
      if (nullValue !== null && numeric === nullValue) {
        values[rowIndex] = Number.NaN;
        mask[rowIndex] = 0;
      } else {
        values[rowIndex] = numeric;
      }
    }
  });

  const wellId = options.wellId?.trim() || findField(wellSection?.fields ?? [], "WELL")?.value.trim() || "las-well";
  const curves = curveSection.fields.flatMap((field, index) => {
    if (index === depthCurveIndex) {
      return [];
    }
    const values = valuesByCurve[index];
    const validityMask = masksByCurve[index];
    if (!values || !validityMask) {
      throw new LasParseError("invalid-row", field.line, "Curve column allocation failed.");
    }
    return [{
      wellId,
      mnemonic: field.mnemonic,
      unit: unitMetadata(field.unit),
      description: field.description,
      depthReference: `${depthCurve.mnemonic}${depthCurve.unit ? ` (${depthCurve.unit})` : ""}`,
      depths,
      values,
      nullValue,
      validityMask
    } satisfies WellLogCurve];
  });
  return {
    wellId,
    curves,
    metadata: {
      sections,
      version,
      well: wellSection?.fields ?? [],
      curves: curveSection.fields,
      parameters: findSection(sections, "parameter")?.fields ?? [],
      other: sections.filter((section) => section.name === "other"),
      versionNumber: versionField.value.trim(),
      wrapped,
      nullValue,
      depthCurve
    }
  };
}

function readSections(text: string, shouldCancel: (() => boolean) | undefined): LasPreservedSection[] {
  const sections: MutableSection[] = [];
  let current: MutableSection | undefined;
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    if (shouldCancel?.()) {
      throw new LasParseError("cancelled", index + 1, "Parsing was cancelled.");
    }
    const raw = lines[index] ?? "";
    const trimmed = raw.trim();
    if (trimmed.startsWith("~")) {
      current = { name: sectionName(trimmed), line: index + 1, rawHeader: raw, lines: [], fields: [] };
      sections.push(current);
      continue;
    }
    if (!current) {
      continue;
    }
    current.lines.push(raw);
    if (current.name !== "ascii" && trimmed && !trimmed.startsWith("#")) {
      const field = parseMetadataField(raw, index + 1, current.name);
      if (field) {
        current.fields.push(field);
      }
    }
  }
  return sections;
}

function readDataRows(section: LasPreservedSection, curveCount: number, wrapped: boolean, maximumRows: number, shouldCancel: (() => boolean) | undefined): readonly DataRow[] {
  const rows: DataRow[] = [];
  const tokens: DataToken[] = [];
  let skippedHeader = false;
  section.lines.forEach((raw, index) => {
    const line = section.line + index + 1;
    if (shouldCancel?.()) {
      throw new LasParseError("cancelled", line, "Parsing was cancelled.");
    }
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      return;
    }
    const values = trimmed.replace(/,/g, " ").split(/\s+/);
    if (!skippedHeader && values.some((value) => !isNumeric(value))) {
      skippedHeader = true;
      return;
    }
    if (wrapped) {
      values.forEach((value) => tokens.push({ value, line }));
      return;
    }
    if (values.length !== curveCount) {
      throw new LasParseError("inconsistent-row", line, `Expected ${curveCount} values but found ${values.length}.`);
    }
    addRow(rows, { values, line }, maximumRows);
  });
  if (!wrapped) {
    return rows;
  }
  if (tokens.length % curveCount !== 0) {
    const last = tokens[tokens.length - 1];
    throw new LasParseError("inconsistent-row", last?.line ?? section.line, `Wrapped data has ${tokens.length} values, not a multiple of ${curveCount}.`);
  }
  for (let offset = 0; offset < tokens.length; offset += curveCount) {
    const rowTokens = tokens.slice(offset, offset + curveCount);
    addRow(rows, { values: rowTokens.map((token) => token.value), line: rowTokens[0]?.line ?? section.line }, maximumRows);
  }
  return rows;
}

function addRow(rows: DataRow[], row: DataRow, maximumRows: number): void {
  if (rows.length >= maximumRows) {
    throw new LasParseError("row-limit", row.line, `Row count exceeds the configured limit of ${maximumRows}.`);
  }
  rows.push(row);
}

function parseMetadataField(raw: string, line: number, section: string): LasMetadataField | undefined {
  const colon = raw.indexOf(":");
  const left = (colon === -1 ? raw : raw.slice(0, colon)).trim();
  if (!left) {
    return undefined;
  }
  const dot = left.indexOf(".");
  if (dot === -1) {
    return undefined;
  }
  const mnemonic = left.slice(0, dot).trim();
  const afterDot = left.slice(dot + 1);
  if (!mnemonic) {
    return undefined;
  }
  const tokens = afterDot.trim().split(/\s+/).filter(Boolean);
  const hasBlankUnit = section !== "curve" && /^\s/.test(afterDot);
  const unit = section === "curve" ? tokens[0] ?? "" : hasBlankUnit ? "" : tokens[0] ?? "";
  const value = section === "curve" ? tokens.slice(1).join(" ") : hasBlankUnit ? afterDot.trim() : tokens.slice(1).join(" ");
  return {
    mnemonic,
    unit,
    value,
    description: colon === -1 ? "" : raw.slice(colon + 1).trim(),
    line,
    raw
  };
}

function sectionName(header: string): string {
  const name = header.slice(1).trim().toLowerCase();
  if (name.startsWith("v")) return "version";
  if (name.startsWith("w")) return "well";
  if (name.startsWith("c")) return "curve";
  if (name.startsWith("p")) return "parameter";
  if (name.startsWith("o")) return "other";
  if (name.startsWith("a")) return "ascii";
  return "unknown";
}

function findSection(sections: readonly LasPreservedSection[], name: string): LasPreservedSection | undefined {
  return sections.find((section) => section.name === name);
}

function findField(fields: readonly LasMetadataField[], mnemonic: string): LasMetadataField | undefined {
  return fields.find((field) => field.mnemonic.toUpperCase() === mnemonic);
}

function validateUniqueMnemonics(fields: readonly LasMetadataField[]): void {
  const seen = new Set<string>();
  for (const field of fields) {
    const mnemonic = field.mnemonic.toUpperCase();
    if (seen.has(mnemonic)) {
      throw new LasParseError("duplicate-mnemonic", field.line, `Duplicate curve mnemonic '${field.mnemonic}'.`);
    }
    seen.add(mnemonic);
  }
}

function identifyDepthCurve(fields: readonly LasMetadataField[]): LasMetadataField {
  const depth = fields.find((field) => /^(DEPT|DEPTH|MD|TVD|TVDSS|TVDMSL)$/i.test(field.mnemonic));
  if (!depth) {
    throw new LasParseError("missing-depth-curve", fields[0]?.line ?? 1, "No recognized depth-curve mnemonic was found.");
  }
  return depth;
}

function parseFiniteNumber(value: string, line: number, context: string): number {
  const numeric = Number(value.replace(/[dD]/g, "E"));
  if (!Number.isFinite(numeric)) {
    throw new LasParseError("invalid-number", line, `${context} '${value}' is not finite numeric data.`);
  }
  return numeric;
}

function isNumeric(value: string): boolean {
  return Number.isFinite(Number(value.replace(/[dD]/g, "E")));
}

function parseWrapValue(field: LasMetadataField): boolean {
  const value = field.value.trim().toUpperCase();
  if (value === "YES" || value === "Y") return true;
  if (value === "NO" || value === "N" || value === "") return false;
  throw new LasParseError("invalid-metadata", field.line, `WRAP value '${field.value}' must be YES or NO.`);
}

function validateLimits(limits: LasParserLimits): void {
  if (!Number.isSafeInteger(limits.maxRows) || limits.maxRows < 1 || !Number.isSafeInteger(limits.maxCurves) || limits.maxCurves < 1) {
    throw new LasParseError("invalid-metadata", 1, "Parser row and curve limits must be positive integers.");
  }
}

function unitMetadata(unit: string): UnitMetadata {
  const normalized = unit.trim().toUpperCase();
  if (normalized === "M" || normalized === "METRE" || normalized === "METER") {
    return { id: "las-metre", label: "Metre", symbol: "m", dimension: "length", toBaseFactor: 1 };
  }
  if (normalized === "FT" || normalized === "FEET" || normalized === "FOOT") {
    return { id: "las-foot", label: "Foot", symbol: "ft", dimension: "length", toBaseFactor: 0.3048 };
  }
  return { id: `las-${normalized.toLowerCase() || "unitless"}`, label: unit.trim() || "Unitless", symbol: unit.trim() || "-", dimension: "dimensionless", toBaseFactor: 1 };
}

interface MutableSection {
  readonly name: string;
  readonly line: number;
  readonly rawHeader: string;
  readonly lines: string[];
  readonly fields: LasMetadataField[];
}

interface DataToken {
  readonly value: string;
  readonly line: number;
}

interface DataRow {
  readonly values: readonly string[];
  readonly line: number;
}