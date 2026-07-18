import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { GrdeclSemanticError, parseGrdecl } from "../../../../src/reservoir/formats/grdecl";

async function fixture(name: string): Promise<string> {
  return readFile(fileURLToPath(new URL(`../../../fixtures/grdecl/${name}`, import.meta.url)), "utf8");
}

function coordValues(nx: number, ny: number, nz: number): string {
  const values: string[] = [];
  for (let j = 0; j <= ny; j += 1) {
    for (let i = 0; i <= nx; i += 1) {
      values.push(`${i} ${j} 0 ${i} ${j} ${nz}`);
    }
  }
  return values.join(" ");
}

describe("GRDECL semantic subset parser", () => {
  it("produces a versioned 1x1x1 reservoir contract with Float64 geometry", async () => {
    const parsed = await parseGrdecl([await fixture("semantic-1x1x1.grdecl")], { caseId: "one-cell" });
    const grid = parsed.reservoirCase.grids[0];

    expect(parsed.reservoirCase.metadata).toMatchObject({ schemaVersion: "1.0.0", caseId: "one-cell" });
    expect(grid).toMatchObject({ kind: "corner-point" });
    if (!grid || grid.kind !== "corner-point") {
      throw new Error("Parsed grid invariant failed.");
    }
    expect(grid.geometry.dimensions).toEqual({ nx: 1, ny: 1, nz: 1, totalCellCount: 1 });
    expect(grid.geometry.pillarCoordinates).toBeInstanceOf(Float64Array);
    expect(grid.geometry.cornerDepths).toEqual(new Float64Array([0, 0, 0, 0, 1, 1, 1, 1]));
    expect(grid.geometry.activityMask).toEqual(new Uint8Array([1]));
    expect(parsed.reservoirCase.propertyCatalog[0]).toMatchObject({ keyword: "PORO", range: { min: 0.25, max: 0.25 } });
  });

  it("accepts DIMENS and validates a 2x2x2 deck with repetition", async () => {
    const text = `DIMENS 2 2 2 /\nCOORD ${coordValues(2, 2, 2)} /\nZCORN 32*0 32*2 /\nACTNUM 8*1 /\nPORO 8*0.2 /`;
    const parsed = await parseGrdecl([text]);
    const grid = parsed.reservoirCase.grids[0];

    expect(grid).toMatchObject({ kind: "corner-point" });
    if (!grid || grid.kind !== "corner-point") {
      throw new Error("Parsed grid invariant failed.");
    }
    expect(grid.geometry.dimensions.totalCellCount).toBe(8);
    expect(grid.geometry.pillarCoordinates.length).toBe(54);
    expect(grid.geometry.cornerDepths.length).toBe(64);
    expect(parsed.reservoirCase.propertyCatalog).toHaveLength(1);
  });

  it("preserves default property repetitions with a validity mask", async () => {
    const text = `SPECGRID 1 1 1 / COORD ${coordValues(1, 1, 1)} / ZCORN 4*0 4*1 / PORO 1* /`;
    const parsed = await parseGrdecl([text]);
    const descriptor = parsed.reservoirCase.propertyCatalog[0];
    const frame = parsed.reservoirCase.propertyFrames[0];

    expect(descriptor).toMatchObject({ nullRepresentation: { kind: "validity-mask" } });
    expect(frame?.validityMask).toEqual(new Uint8Array([0]));
    expect(Number.isNaN(frame?.values[0] ?? 0)).toBe(true);
  });

  it("reports missing arrays, incorrect counts, duplicate dimensions, and malformed termination precisely", async () => {
    await expect(parseGrdecl(["SPECGRID 1 1 1 / COORD 24*0 /"])).rejects.toMatchObject({ code: "missing-keyword", keyword: "ZCORN" } satisfies Partial<GrdeclSemanticError>);
    await expect(parseGrdecl(["SPECGRID 1 1 1 / COORD 23*0 / ZCORN 8*0 /"])).rejects.toMatchObject({ code: "incorrect-count", keyword: "COORD" });
    await expect(parseGrdecl(["SPECGRID 1 1 1 / DIMENS 1 1 1 /"])).rejects.toMatchObject({ code: "duplicate-dimensions" });
    await expect(parseGrdecl(["SPECGRID 1 1 1 COORD 24*0 /"])).rejects.toMatchObject({ code: "unterminated-keyword", keyword: "SPECGRID" });
  });

  it("validates exact ZCORN, ACTNUM, and property array counts", async () => {
    const prefix = `SPECGRID 1 1 1 / COORD ${coordValues(1, 1, 1)} /`;

    await expect(parseGrdecl([`${prefix} ZCORN 7*0 /`])).rejects.toMatchObject({ code: "incorrect-count", keyword: "ZCORN" });
    await expect(parseGrdecl([`${prefix} ZCORN 4*0 4*1 / ACTNUM 2*1 /`])).rejects.toMatchObject({ code: "incorrect-count", keyword: "ACTNUM" });
    await expect(parseGrdecl([`${prefix} ZCORN 4*0 4*1 / PORO 2*0.1 /`])).rejects.toMatchObject({ code: "incorrect-count", keyword: "PORO" });
  });

  it("skips safely terminated unknown blocks and preserves inactive/property arrays", async () => {
    const text = `SPECGRID 2 1 1 / UNKNOWN 1 2 'text' / COORD ${coordValues(2, 1, 1)} / ZCORN 8*0 8*1 / ACTNUM 1 0 / PORO 0.1 0.2 /`;
    const parsed = await parseGrdecl([text]);
    const grid = parsed.reservoirCase.grids[0];
    const property = parsed.reservoirCase.propertyCatalog[0];

    expect(parsed.warnings).toEqual([expect.objectContaining({ code: "unknown-keyword", keyword: "UNKNOWN" })]);
    if (!grid || grid.kind !== "corner-point") {
      throw new Error("Parsed grid invariant failed.");
    }
    expect(grid.geometry.activityMask).toEqual(new Uint8Array([1, 0]));
    expect(property).toMatchObject({ keyword: "PORO", range: { min: 0.1, max: 0.2 } });
  });
});