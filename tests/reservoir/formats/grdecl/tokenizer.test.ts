import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { GrdeclLexicalError, tokenizeGrdecl } from "../../../../src/reservoir/formats/grdecl";

async function tokensFromChunks(chunks: readonly string[], options = {}) {
  const tokens = [];
  for await (const token of tokenizeGrdecl(chunks, options)) {
    tokens.push(token);
  }
  return tokens;
}

async function fixture(name: string): Promise<string> {
  return readFile(fileURLToPath(new URL(`../../../fixtures/grdecl/${name}`, import.meta.url)), "utf8");
}

describe("GRDECL lexical tokenizer", () => {
  it("streams whitespace variations, comments, numbers, repetitions, and slash tokens", async () => {
    const text = await fixture("lexical-sample.grdecl");
    const tokens = await tokensFromChunks([text.slice(0, 17), text.slice(17)]);

    expect(tokens.map((token) => token.kind)).toEqual(["comment", "keyword", "number", "number", "repetition", "repetition", "slash", "keyword", "string", "slash"]);
    expect(tokens[2]).toMatchObject({ kind: "number", value: 1, location: { line: 3, column: 3 } });
    expect(tokens[3]).toMatchObject({ kind: "number", value: -25 });
    expect(tokens[4]).toMatchObject({ kind: "repetition", count: 3, value: 0.25 });
    expect(tokens[5]).toMatchObject({ kind: "repetition", count: 2, value: undefined });
    expect(tokens[8]).toMatchObject({ kind: "string", value: "Synthetic deck" });
  });

  it("tracks CRLF and quoted strings", async () => {
    const windows = await tokensFromChunks([await fixture("windows-newlines.grdecl")]);
    const quoted = await tokensFromChunks([await fixture("quoted-strings.grdecl")]);

    expect(windows[0]).toMatchObject({ kind: "keyword", value: "SPECGRID", location: { line: 1, column: 1, offset: 0 } });
    expect(windows[1]).toMatchObject({ kind: "number", value: 2, location: { line: 2, column: 3 } });
    expect(quoted.filter((token) => token.kind === "string").map((token) => token.value)).toEqual(["A quoted value", "single quoted"]);
  });

  it("rejects malformed numbers and repetition syntax", async () => {
    await expect(tokensFromChunks(["PORO 1.2.3 /"])).rejects.toMatchObject({ code: "invalid-number" } satisfies Partial<GrdeclLexicalError>);
    await expect(tokensFromChunks(["PORO 2**1 /"])).rejects.toMatchObject({ code: "invalid-repetition" } satisfies Partial<GrdeclLexicalError>);
    await expect(tokensFromChunks(["PORO 2*abc /"])).rejects.toMatchObject({ code: "invalid-repetition" } satisfies Partial<GrdeclLexicalError>);
  });

  it("reports unexpected EOF inside a quoted string", async () => {
    await expect(tokensFromChunks(["TITLE 'unfinished"])).rejects.toMatchObject({ code: "unexpected-eof", location: { line: 1, column: 7 } });
  });

  it("enforces repetition and numeric array limits", async () => {
    await expect(tokensFromChunks(["100*1.0"], { limits: { maxRepetitionCount: 10 } })).rejects.toMatchObject({ code: "repetition-limit" });
    await expect(tokensFromChunks(["2* 2*1"], { limits: { maxNumericValues: 3 } })).rejects.toMatchObject({ code: "numeric-array-limit" });
  });

  it("supports cancellation before consuming input", async () => {
    await expect(tokensFromChunks(["PORO 1 /"], { shouldCancel: () => true })).rejects.toMatchObject({ code: "cancelled" });
  });
});