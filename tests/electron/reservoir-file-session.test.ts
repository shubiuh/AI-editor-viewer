import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  RESERVOIR_FILE_ERROR_CODES,
  ReservoirFileSessionStore
} from "../../electron/reservoir-file-session.js";
import * as fs from "node:fs/promises";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function createStoreWithFixture(contents = "0123456789") {
  const directory = await mkdtemp(join(tmpdir(), "reservoir-file-session-"));
  temporaryDirectories.push(directory);
  const filePath = join(directory, "synthetic.egrid");
  await writeFile(filePath, contents);
  const store = new ReservoirFileSessionStore({ fs, maxReadSize: 4, createToken: () => "test-token" });
  const registered = await store.registerFilePath(filePath);
  if (!registered.ok) {
    throw new Error("Temporary fixture registration failed.");
  }
  return { store, filePath, metadata: registered.metadata };
}

describe("reservoir file sessions", () => {
  it("returns metadata without exposing the selected path and reads an ArrayBuffer range", async () => {
    const { store, metadata } = await createStoreWithFixture();
    const result = await store.readRange({ token: metadata.token, offset: 2, length: 4 });

    expect(metadata).toMatchObject({ fileName: "synthetic.egrid", extension: ".egrid", size: 10 });
    expect("filePath" in metadata).toBe(false);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toBeInstanceOf(ArrayBuffer);
      expect(new TextDecoder().decode(result.data)).toBe("2345");
    }
  });

  it("rejects an invalid or released token", async () => {
    const { store, metadata } = await createStoreWithFixture();
    const invalid = await store.readRange({ token: "injected-path", offset: 0, length: 1 });
    const released = store.release(metadata.token);
    const afterRelease = await store.readRange({ token: metadata.token, offset: 0, length: 1 });

    expect(invalid).toMatchObject({ ok: false, error: { code: RESERVOIR_FILE_ERROR_CODES.invalidToken } });
    expect(released).toEqual({ ok: true, released: true });
    expect(afterRelease).toMatchObject({ ok: false, error: { code: RESERVOIR_FILE_ERROR_CODES.invalidToken } });
  });

  it("rejects malformed, oversized, and out-of-bounds ranges", async () => {
    const { store, metadata } = await createStoreWithFixture();
    const malformed = await store.readRange({ token: metadata.token, offset: -1, length: 1 });
    const oversized = await store.readRange({ token: metadata.token, offset: 0, length: 5 });
    const outOfBounds = await store.readRange({ token: metadata.token, offset: 9, length: 2 });

    expect(malformed).toMatchObject({ ok: false, error: { code: RESERVOIR_FILE_ERROR_CODES.invalidRange } });
    expect(oversized).toMatchObject({ ok: false, error: { code: RESERVOIR_FILE_ERROR_CODES.requestTooLarge } });
    expect(outOfBounds).toMatchObject({ ok: false, error: { code: RESERVOIR_FILE_ERROR_CODES.rangeOutOfBounds } });
  });
});