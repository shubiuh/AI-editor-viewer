import { reservoirSchemaVersion, structuredCellIndexConvention, type CornerPointGridGeometry, type PropertyDescriptor, type PropertyFrame, type ReservoirCase, type StructuredGridDimensions } from "../../domain/types";
import { tokenizeGrdecl } from "./tokenizer";
import type { GrdeclLocation, GrdeclToken, GrdeclTokenizerOptions } from "./types";

const defaultCellPropertyKeywords = new Set([
  "PORO", "NTG", "PERMX", "PERMY", "PERMZ", "PRESSURE", "SGAS", "SOIL", "SWAT"
]);

const defaultParserLimits: GrdeclParserLimits = {
  maxCells: 10_000_000,
  maxArrayValues: 100_000_000,
  maxProperties: 256,
  maxWarnings: 1_000
};

const dimensionlessUnit = {
  id: "dimensionless",
  label: "Dimensionless",
  symbol: "-",
  dimension: "dimensionless" as const,
  toBaseFactor: 1
};

export interface GrdeclParserLimits {
  readonly maxCells: number;
  readonly maxArrayValues: number;
  readonly maxProperties: number;
  readonly maxWarnings: number;
}

export interface GrdeclParserOptions {
  readonly tokenizer?: GrdeclTokenizerOptions;
  readonly limits?: Partial<GrdeclParserLimits>;
  readonly caseId?: string;
  readonly caseName?: string;
  readonly selectedCellPropertyKeywords?: ReadonlySet<string>;
}

export interface GrdeclParseWarning {
  readonly code: "unknown-keyword";
  readonly keyword: string;
  readonly location: GrdeclLocation;
  readonly message: string;
}

export interface GrdeclParseResult {
  readonly reservoirCase: ReservoirCase;
  readonly warnings: readonly GrdeclParseWarning[];
}

export type GrdeclSemanticErrorCode =
  | "missing-dimensions"
  | "duplicate-dimensions"
  | "missing-keyword"
  | "incorrect-count"
  | "unterminated-keyword"
  | "invalid-value"
  | "default-not-allowed"
  | "parser-limit"
  | "unexpected-token";

export class GrdeclSemanticError extends Error {
  public readonly code: GrdeclSemanticErrorCode;
  public readonly keyword: string | undefined;
  public readonly location: GrdeclLocation;

  public constructor(code: GrdeclSemanticErrorCode, message: string, location: GrdeclLocation, keyword?: string) {
    super(message);
    this.name = "GrdeclSemanticError";
    this.code = code;
    this.keyword = keyword;
    this.location = location;
  }
}

export async function parseGrdecl(
  chunks: AsyncIterable<string> | Iterable<string>,
  options: GrdeclParserOptions = {}
): Promise<GrdeclParseResult> {
  const parser = new GrdeclSemanticParser(options);
  for await (const token of tokenizeGrdecl(chunks, options.tokenizer)) {
    parser.consume(token);
  }
  return parser.finish();
}

export class GrdeclSemanticParser {
  private readonly limits: GrdeclParserLimits;
  private readonly selectedCellPropertyKeywords: ReadonlySet<string>;
  private readonly caseId: string;
  private readonly caseName: string;
  private dimensions: StructuredGridDimensions | undefined;
  private dimensionsKeyword: string | undefined;
  private coord: NumericAccumulator | undefined;
  private zcorn: NumericAccumulator | undefined;
  private actnum: NumericAccumulator | undefined;
  private readonly properties = new Map<string, NumericAccumulator>();
  private readonly warnings: GrdeclParseWarning[] = [];
  private block: ActiveBlock | undefined;

  public constructor(options: GrdeclParserOptions = {}) {
    this.limits = { ...defaultParserLimits, ...options.limits };
    this.selectedCellPropertyKeywords = options.selectedCellPropertyKeywords ?? defaultCellPropertyKeywords;
    this.caseId = options.caseId ?? "grdecl-case";
    this.caseName = options.caseName ?? "GRDECL-style ASCII case";
  }

  public consume(token: GrdeclToken): void {
    if (token.kind === "comment") {
      return;
    }
    if (!this.block) {
      this.consumeTopLevel(token);
      return;
    }
    this.consumeBlock(token);
  }

  public finish(): GrdeclParseResult {
    if (this.block) {
      throw this.error("unterminated-keyword", `Keyword ${this.block.keyword} is missing its slash terminator.`, this.block.location, this.block.keyword);
    }
    if (!this.dimensions) {
      throw this.error("missing-dimensions", "SPECGRID or DIMENS is required before reservoir arrays.", { line: 1, column: 1, offset: 0 });
    }
    if (!this.coord) {
      throw this.error("missing-keyword", "COORD is required.", { line: 1, column: 1, offset: 0 }, "COORD");
    }
    if (!this.zcorn) {
      throw this.error("missing-keyword", "ZCORN is required.", { line: 1, column: 1, offset: 0 }, "ZCORN");
    }

    const coordValues = this.finalizeGeometry("COORD", this.coord, expectedCoordCount(this.dimensions));
    const zcornValues = this.finalizeGeometry("ZCORN", this.zcorn, this.dimensions.totalCellCount * 8);
    const activityMask = this.actnum ? this.finalizeActivity(this.actnum, this.dimensions.totalCellCount) : undefined;
    const geometry: CornerPointGridGeometry = {
      dimensions: this.dimensions,
      pillarCoordinates: coordValues,
      cornerDepths: zcornValues,
      ...(activityMask ? { activityMask } : {}),
      originalCellIds: createOriginalCellIds(this.dimensions.totalCellCount),
      coordinateConvention: {
        axisOrder: "xyz",
        verticalDirection: "positive-down",
        depthReference: "GRDECL ZCORN depth values",
        cellIndexConvention: structuredCellIndexConvention
      }
    };
    const { propertyCatalog, propertyFrames } = this.finalizeProperties(this.dimensions.totalCellCount);

    return {
      reservoirCase: {
        metadata: {
          schemaVersion: reservoirSchemaVersion,
          caseId: this.caseId,
          caseName: this.caseName,
          sourceFormat: { kind: "open-standard", name: "GRDECL-style ASCII", version: "lexical-subset-1" },
          coordinateReferenceSystem: { kind: "unknown", name: "Not specified in GRDECL subset" },
          units: [dimensionlessUnit],
          localOrigin: [0, 0, 0],
          creation: { createdAt: new Date(0).toISOString(), importTool: "independent GRDECL subset parser" }
        },
        grids: [{ kind: "corner-point", gridId: "main-grid", displayName: "Main grid", geometry }],
        propertyCatalog,
        propertyFrames,
        wells: [],
        wellLogCurves: [],
        timeStepCatalog: [{ index: 0, time: { kind: "simulation-time", value: 0, unit: dimensionlessUnit }, label: "Static" }]
      },
      warnings: this.warnings
    };
  }

  private consumeTopLevel(token: GrdeclToken): void {
    if (token.kind === "slash") {
      throw this.error("unexpected-token", "Slash terminator has no active keyword.", token.location);
    }
    if (token.kind !== "keyword") {
      throw this.error("unexpected-token", "Expected a keyword at top level.", token.location);
    }

    const keyword = token.value.toUpperCase();
    if (keyword === "SPECGRID" || keyword === "DIMENS" || keyword === "COORD" || keyword === "ZCORN" || keyword === "ACTNUM" || this.selectedCellPropertyKeywords.has(keyword)) {
      if ((keyword === "COORD" || keyword === "ZCORN" || keyword === "ACTNUM" || this.selectedCellPropertyKeywords.has(keyword)) && !this.dimensions) {
        throw this.error("missing-dimensions", `${keyword} requires SPECGRID or DIMENS first.`, token.location, keyword);
      }
      this.block = { kind: "known", keyword, location: token.location, values: new NumericAccumulator(this.limits.maxArrayValues, keyword, token.location) };
      return;
    }
    this.block = { kind: "unknown", keyword, location: token.location };
  }

  private consumeBlock(token: GrdeclToken): void {
    if (token.kind === "slash") {
      this.finishBlock();
      return;
    }
    const block = this.block;
    if (!block || block.kind === "unknown") {
      return;
    }
    if (token.kind === "number") {
      block.values.append(token.value, true, token.location);
      return;
    }
    if (token.kind === "repetition") {
      block.values.appendRepetition(token.count, token.value, token.location);
      return;
    }
    throw this.error("unterminated-keyword", `Keyword ${block.keyword} must terminate before ${token.kind}.`, token.location, block.keyword);
  }

  private finishBlock(): void {
    const block = this.block;
    this.block = undefined;
    if (!block) {
      return;
    }
    if (block.kind === "unknown") {
      if (this.warnings.length >= this.limits.maxWarnings) {
        throw this.error("parser-limit", `Unknown keyword warning count exceeds ${this.limits.maxWarnings}.`, block.location, block.keyword);
      }
      this.warnings.push({ code: "unknown-keyword", keyword: block.keyword, location: block.location, message: `Skipped unknown keyword ${block.keyword} through its slash terminator.` });
      return;
    }

    if (block.keyword === "SPECGRID" || block.keyword === "DIMENS") {
      this.finishDimensions(block);
    } else if (block.keyword === "COORD") {
      this.replaceBlock("COORD", block.values, (value) => { this.coord = value; });
    } else if (block.keyword === "ZCORN") {
      this.replaceBlock("ZCORN", block.values, (value) => { this.zcorn = value; });
    } else if (block.keyword === "ACTNUM") {
      this.replaceBlock("ACTNUM", block.values, (value) => { this.actnum = value; });
    } else {
      if (this.properties.size >= this.limits.maxProperties && !this.properties.has(block.keyword)) {
        throw this.error("parser-limit", `Property count exceeds ${this.limits.maxProperties}.`, block.location, block.keyword);
      }
      this.properties.set(block.keyword, block.values);
    }
  }

  private finishDimensions(block: KnownBlock): void {
    if (this.dimensions) {
      throw this.error("duplicate-dimensions", `${block.keyword} duplicates ${this.dimensionsKeyword}.`, block.location, block.keyword);
    }
    if (block.values.hasDefaults()) {
      throw this.error("default-not-allowed", `${block.keyword} cannot contain default repetitions.`, block.location, block.keyword);
    }
    const values = block.values.values();
    const allowedCount = block.keyword === "SPECGRID" ? [3, 5] : [3];
    if (!allowedCount.includes(values.length)) {
      throw this.error("incorrect-count", `${block.keyword} requires ${allowedCount.join(" or ")} numeric values.`, block.location, block.keyword);
    }
    const [nx, ny, nz] = values;
    if (!isPositiveInteger(nx) || !isPositiveInteger(ny) || !isPositiveInteger(nz)) {
      throw this.error("invalid-value", `${block.keyword} dimensions must be positive integers.`, block.location, block.keyword);
    }
    const totalCellCount = nx * ny * nz;
    if (!Number.isSafeInteger(totalCellCount) || totalCellCount > this.limits.maxCells) {
      throw this.error("parser-limit", `Cell count exceeds ${this.limits.maxCells}.`, block.location, block.keyword);
    }
    this.dimensions = { nx, ny, nz, totalCellCount };
    this.dimensionsKeyword = block.keyword;
  }

  private finalizeGeometry(keyword: string, values: NumericAccumulator, expectedCount: number): Float64Array {
    if (values.length !== expectedCount) {
      throw this.error("incorrect-count", `${keyword} requires exactly ${expectedCount} numeric values; found ${values.length}.`, values.location, keyword);
    }
    if (values.hasDefaults()) {
      throw this.error("default-not-allowed", `${keyword} cannot contain default repetitions.`, values.firstDefaultLocation() ?? values.location, keyword);
    }
    return values.values();
  }

  private finalizeActivity(values: NumericAccumulator, expectedCount: number): Uint8Array {
    if (values.length !== expectedCount) {
      throw this.error("incorrect-count", `ACTNUM requires exactly ${expectedCount} numeric values; found ${values.length}.`, values.location, "ACTNUM");
    }
    if (values.hasDefaults()) {
      throw this.error("default-not-allowed", "ACTNUM cannot contain default repetitions.", values.firstDefaultLocation() ?? values.location, "ACTNUM");
    }
    const activity = new Uint8Array(expectedCount);
    const source = values.values();
    for (let index = 0; index < source.length; index += 1) {
      activity[index] = (source[index] ?? 0) > 0 ? 1 : 0;
    }
    return activity;
  }

  private finalizeProperties(expectedCount: number): { propertyCatalog: PropertyDescriptor[]; propertyFrames: PropertyFrame[] } {
    const propertyCatalog: PropertyDescriptor[] = [];
    const propertyFrames: PropertyFrame[] = [];
    for (const [keyword, values] of this.properties) {
      if (values.length !== expectedCount) {
        throw this.error("incorrect-count", `${keyword} requires exactly ${expectedCount} numeric values; found ${values.length}.`, values.location, keyword);
      }
      const validityMask = values.validityMask();
      const range = values.numericRange();
      const propertyId = `cell-${keyword.toLowerCase()}`;
      propertyCatalog.push({
        id: propertyId,
        keyword,
        displayName: keyword,
        unit: dimensionlessUnit,
        location: "cell",
        valueType: "float64",
        nullRepresentation: values.hasDefaults() ? { kind: "validity-mask" } : { kind: "none" },
        temporalKind: { kind: "static" },
        ...(range ? { range } : {})
      });
      propertyFrames.push({
        propertyId,
        timeStepIndex: 0,
        time: { kind: "simulation-time", value: 0, unit: dimensionlessUnit },
        values: values.values(),
        ...(values.hasDefaults() ? { validityMask } : {})
      });
    }
    return { propertyCatalog, propertyFrames };
  }

  private replaceBlock(keyword: string, value: NumericAccumulator, assign: (value: NumericAccumulator) => void): void {
    const existing = keyword === "COORD" ? this.coord : keyword === "ZCORN" ? this.zcorn : this.actnum;
    if (existing) {
      throw this.error("unexpected-token", `${keyword} may appear only once in this parser subset.`, value.location, keyword);
    }
    assign(value);
  }

  private error(code: GrdeclSemanticErrorCode, message: string, location: GrdeclLocation, keyword?: string): GrdeclSemanticError {
    return new GrdeclSemanticError(code, message, location, keyword);
  }
}

type ActiveBlock = KnownBlock | UnknownBlock;

interface KnownBlock {
  readonly kind: "known";
  readonly keyword: string;
  readonly location: GrdeclLocation;
  readonly values: NumericAccumulator;
}

interface UnknownBlock {
  readonly kind: "unknown";
  readonly keyword: string;
  readonly location: GrdeclLocation;
}

class NumericAccumulator {
  private data = new Float64Array(16);
  private validity = new Uint8Array(16);
  private valueCount = 0;
  private defaultLocation: GrdeclLocation | undefined;

  public constructor(
    private readonly maximumLength: number,
    public readonly keyword: string,
    public readonly location: GrdeclLocation
  ) {}

  public get length(): number {
    return this.valueCount;
  }

  public append(value: number, valid: boolean, location: GrdeclLocation): void {
    this.ensureCapacity(1, location);
    this.data[this.valueCount] = valid ? value : Number.NaN;
    this.validity[this.valueCount] = valid ? 1 : 0;
    if (!valid && !this.defaultLocation) {
      this.defaultLocation = location;
    }
    this.valueCount += 1;
  }

  public appendRepetition(count: number, value: number | undefined, location: GrdeclLocation): void {
    this.ensureCapacity(count, location);
    const valid = value !== undefined;
    for (let index = 0; index < count; index += 1) {
      this.data[this.valueCount + index] = valid ? value : Number.NaN;
      this.validity[this.valueCount + index] = valid ? 1 : 0;
    }
    if (!valid && !this.defaultLocation) {
      this.defaultLocation = location;
    }
    this.valueCount += count;
  }

  public values(): Float64Array {
    return this.data.slice(0, this.valueCount);
  }

  public validityMask(): Uint8Array {
    return this.validity.slice(0, this.valueCount);
  }

  public hasDefaults(): boolean {
    return this.defaultLocation !== undefined;
  }

  public firstDefaultLocation(): GrdeclLocation | undefined {
    return this.defaultLocation;
  }

  public numericRange(): { readonly min: number; readonly max: number } | undefined {
    let min = Infinity;
    let max = -Infinity;
    for (let index = 0; index < this.valueCount; index += 1) {
      if (this.validity[index] === 0) {
        continue;
      }
      const value = this.data[index] ?? Number.NaN;
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
    return Number.isFinite(min) && Number.isFinite(max) ? { min, max } : undefined;
  }

  private ensureCapacity(additionalCount: number, location: GrdeclLocation): void {
    const requiredCount = this.valueCount + additionalCount;
    if (!Number.isSafeInteger(requiredCount) || requiredCount > this.maximumLength) {
      throw new GrdeclSemanticError("parser-limit", `${this.keyword} exceeds the parser array limit of ${this.maximumLength}.`, location, this.keyword);
    }
    if (requiredCount <= this.data.length) {
      return;
    }
    const capacity = Math.max(requiredCount, this.data.length * 2);
    const nextData = new Float64Array(capacity);
    const nextValidity = new Uint8Array(capacity);
    nextData.set(this.data);
    nextValidity.set(this.validity);
    this.data = nextData;
    this.validity = nextValidity;
  }
}

function expectedCoordCount(dimensions: StructuredGridDimensions): number {
  return 6 * (dimensions.nx + 1) * (dimensions.ny + 1);
}

function createOriginalCellIds(totalCellCount: number): Uint32Array {
  const ids = new Uint32Array(totalCellCount);
  for (let index = 0; index < totalCellCount; index += 1) {
    ids[index] = index;
  }
  return ids;
}

function isPositiveInteger(value: number | undefined): value is number {
  return value !== undefined && Number.isSafeInteger(value) && value > 0;
}