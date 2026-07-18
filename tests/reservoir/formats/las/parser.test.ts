import { describe, expect, it } from "vitest";

import { LasParseError, parseLas2 } from "../../../../src/reservoir/formats/las";

function las({ version = "VERS. 2.0 : CWLS LAS 2.0", wrap = "WRAP. NO : one row per depth", well = "WELL. WELL-01 : Well name\nNULL. -999.25 : Null", curves = "DEPT.M : Measured depth\nGR.API : Gamma ray", parameter = "RUN. 42 : Acquisition run", other = "Free-form preserved note", ascii = "1000 50\n1001 51", sectionNames = { version: "V", well: "W", curves: "C", parameter: "P", other: "O", ascii: "A" } } = {}) {
  return [
    `~${sectionNames.version}ersion Information`, version, wrap,
    `~${sectionNames.well}ell Information`, well,
    `~${sectionNames.curves}urve Information`, curves,
    `~${sectionNames.parameter}arameter Information`, parameter,
    `~${sectionNames.other}ther Information`, other,
    `~${sectionNames.ascii}`, ascii
  ].join("\n");
}

describe("independent LAS 2.0 parser", () => {
  it("parses a minimal LAS 2.0 file into Float64 WellLogCurve data and preserves metadata", () => {
    const parsed = parseLas2(las());
    const curve = parsed.curves[0];

    expect(parsed.wellId).toBe("WELL-01");
    expect(curve).toMatchObject({ mnemonic: "GR", description: "Gamma ray", depthReference: "DEPT (M)", nullValue: -999.25 });
    expect(curve?.depths).toBeInstanceOf(Float64Array);
    expect(curve?.values).toBeInstanceOf(Float64Array);
    expect(curve?.depths).toEqual(new Float64Array([1000, 1001]));
    expect(curve?.values).toEqual(new Float64Array([50, 51]));
    expect(parsed.metadata.versionNumber).toBe("2.0");
    expect(parsed.metadata.parameters).toEqual([expect.objectContaining({ mnemonic: "RUN", value: "42", description: "Acquisition run" })]);
    expect(parsed.metadata.other[0]).toMatchObject({ lines: ["Free-form preserved note"] });
  });

  it("parses multiple curves sharing one identified depth curve", () => {
    const parsed = parseLas2(las({
      curves: "DEPT.FT : Depth\nGR.API : Gamma ray\nRHOB.G/C3 : Bulk density",
      ascii: "1000 50 2.35\n1001 51 2.36"
    }));

    expect(parsed.metadata.depthCurve).toMatchObject({ mnemonic: "DEPT", unit: "FT" });
    expect(parsed.curves.map((curve) => curve.mnemonic)).toEqual(["GR", "RHOB"]);
    expect(parsed.curves[0]?.depths).toBe(parsed.curves[1]?.depths);
    expect(parsed.curves[1]?.values).toEqual(new Float64Array([2.35, 2.36]));
  });

  it("groups wrapped data tokens into complete curve rows", () => {
    const parsed = parseLas2(las({
      wrap: "WRAP. YES : values may continue on later lines",
      curves: "DEPT.M : Depth\nGR.API : Gamma ray\nNPHI.V/V : Porosity",
      ascii: "1000 50\n0.12 1001\n51 0.13"
    }));

    expect(parsed.metadata.wrapped).toBe(true);
    expect(parsed.curves[0]?.depths).toEqual(new Float64Array([1000, 1001]));
    expect(parsed.curves[1]?.values).toEqual(new Float64Array([0.12, 0.13]));
  });

  it("represents LAS NULL values as NaN with a validity mask", () => {
    const parsed = parseLas2(las({ ascii: "1000 50\n1001 -999.25" }));
    const curve = parsed.curves[0];

    expect(Number.isNaN(curve?.values[1] ?? 0)).toBe(true);
    expect(curve?.validityMask).toEqual(new Uint8Array([1, 0]));
  });

  it("requires the version and ASCII sections", () => {
    const missingVersion = las().replace("~Version Information\nVERS. 2.0 : CWLS LAS 2.0\nWRAP. NO : one row per depth\n", "");
    const missingAscii = las().replace("~A\n1000 50\n1001 51", "");

    expect(() => parseLas2(missingVersion)).toThrow(expect.objectContaining({ code: "missing-version-section", line: 1 } satisfies Partial<LasParseError>));
    expect(() => parseLas2(missingAscii)).toThrow(expect.objectContaining({ code: "missing-ascii-section", line: 1 } satisfies Partial<LasParseError>));
  });

  it("reports inconsistent unwrapped row counts with the offending line", () => {
    const source = las({ ascii: "1000 50\n1001" });

    expect(() => parseLas2(source)).toThrow(expect.objectContaining({ code: "inconsistent-row", line: 16 } satisfies Partial<LasParseError>));
  });

  it("rejects duplicate curve mnemonics case-insensitively", () => {
    expect(() => parseLas2(las({ curves: "DEPT.M : Depth\nGR.API : Gamma ray\ngr.API : Duplicate" }))).toThrow(expect.objectContaining({ code: "duplicate-mnemonic" } satisfies Partial<LasParseError>));
  });

  it("accepts case-insensitive section names, unusual whitespace, comments, and blank lines", () => {
    const source = las({
      version: "\tVERS . \t2.00\t: LAS version\n # header comment\n WRAP . NO : not wrapped",
      well: "\n WELL . \tWHITESPACE-1\t: Name\n NULL . -999.25 : null",
      curves: "\n DEPTH \t. M : Depth\n\tGR . API\t : Gamma",
      ascii: "# samples\n\n 1000\t50\n 1001    51",
      sectionNames: { version: "v", well: "w", curves: "c", parameter: "p", other: "o", ascii: "a" }
    });
    const parsed = parseLas2(source);

    expect(parsed.wellId).toBe("WHITESPACE-1");
    expect(parsed.metadata.depthCurve.mnemonic).toBe("DEPTH");
    expect(parsed.curves[0]?.values).toEqual(new Float64Array([50, 51]));
  });

  it("accepts exponent notation in ASCII data", () => {
    const parsed = parseLas2(las({ ascii: "1.000E3 5.0e1\n1.001D3 5.1E+1" }));

    expect(parsed.curves[0]?.depths).toEqual(new Float64Array([1000, 1001]));
    expect(parsed.curves[0]?.values).toEqual(new Float64Array([50, 51]));
  });

  it("enforces configurable limits and can cancel before parsing a large source", () => {
    expect(() => parseLas2(las({ ascii: "1000 50\n1001 51" }), { limits: { maxRows: 1 } })).toThrow(expect.objectContaining({ code: "row-limit" } satisfies Partial<LasParseError>));
    expect(() => parseLas2(las(), { limits: { maxCurves: 1 } })).toThrow(expect.objectContaining({ code: "curve-limit" } satisfies Partial<LasParseError>));
    expect(() => parseLas2(las(), { shouldCancel: () => true })).toThrow(expect.objectContaining({ code: "cancelled", line: 1 } satisfies Partial<LasParseError>));
  });
});