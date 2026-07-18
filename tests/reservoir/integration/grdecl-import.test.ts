import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { ReservoirFileSessionStore } from "../../../electron/reservoir-file-session.js";
import { validateReservoirCase } from "../../../src/reservoir/domain/case-validation";
import { parseGrdecl } from "../../../src/reservoir/formats/grdecl";
import { extractReservoirSurface } from "../../../src/reservoir/geometry/surface-extractor";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("GRDECL reservoir import pipeline", () => {
  it("reads a small ASCII fixture in bounded tokenized ranges, validates it, and extracts visible faces", async () => {
    const directory = await mkdtemp(join(tmpdir(), "grdecl-import-"));
    temporaryDirectories.push(directory);
    const contents = await readFile(fileURLToPath(new URL("../../fixtures/grdecl/semantic-1x1x1.grdecl", import.meta.url)), "utf8");
    const filePath = join(directory, "one-cell.grdecl");
    await writeFile(filePath, contents, "utf8");
    const store = new ReservoirFileSessionStore({ fs, maxReadSize: 17, createToken: () => "one-cell" });
    const opened = await store.registerFilePath(filePath);
    if (!opened.ok) {
      throw new Error("Fixture registration failed.");
    }

    try {
      const parsed = await parseGrdecl(readTextChunks(store, opened.metadata.token, opened.metadata.size, 17));
      const validation = validateReservoirCase(parsed.reservoirCase);
      const grid = parsed.reservoirCase.grids[0];

      expect(validation.ok).toBe(true);
      expect(grid).toMatchObject({ kind: "corner-point" });
      if (!grid || grid.kind !== "corner-point") {
        throw new Error("Parsed corner-point grid invariant failed.");
      }
      const surface = extractReservoirSurface({ kind: "corner-point", geometry: grid.geometry });
      expect(surface).toMatchObject({ status: "completed" });
      if (surface.status !== "completed") {
        throw new Error("Surface extraction invariant failed.");
      }
      expect(surface.geometry.statistics).toMatchObject({ totalCellCount: 1, activeCellCount: 1, emittedFaceCount: 6 });
      expect(parsed.reservoirCase.propertyCatalog.map((property) => property.keyword)).toEqual(["PORO"]);
    } finally {
      expect(store.release(opened.metadata.token)).toEqual({ ok: true, released: true });
    }
  });
});

async function* readTextChunks(store: ReservoirFileSessionStore, token: string, size: number, chunkSize: number): AsyncGenerator<string> {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  for (let offset = 0; offset < size; offset += chunkSize) {
    const result = await store.readRange({ token, offset, length: Math.min(chunkSize, size - offset) });
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    yield decoder.decode(result.data, { stream: true });
  }
  const remaining = decoder.decode();
  if (remaining) {
    yield remaining;
  }
}