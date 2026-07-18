import { describe, expect, it } from "vitest";

import {
  err,
  isErr,
  isOk,
  mapResult,
  ok,
  type Result,
  unwrapOr
} from "../../src/domain/result";

describe("result helpers", () => {
  it("maps successful values without changing their result state", () => {
    const result = mapResult(ok(21), (value) => value * 2);

    expect(isOk(result)).toBe(true);
    expect(unwrapOr(result, 0)).toBe(42);
  });

  it("preserves failures and uses the supplied fallback", () => {
    const failure: Result<string, Error> = err(new Error("invalid dataset"));
    const result = mapResult(failure, (value) => value.toUpperCase());

    expect(isErr(result)).toBe(true);
    expect(unwrapOr(result, "fallback")).toBe("fallback");
    if (isErr(result)) {
      expect(result.error.message).toBe("invalid dataset");
    }
  });
});