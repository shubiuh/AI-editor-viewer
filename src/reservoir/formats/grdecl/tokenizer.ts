import type {
  GrdeclLexicalErrorCode,
  GrdeclLocation,
  GrdeclToken,
  GrdeclTokenizerLimits,
  GrdeclTokenizerOptions
} from "./types";

const defaultLimits: GrdeclTokenizerLimits = {
  maxTokenCount: 1_000_000,
  maxRepetitionCount: 10_000_000,
  maxNumericValues: 100_000_000
};

const numericPattern = /^[+-]?(?:(?:\d+\.\d*)|(?:\.\d+)|(?:\d+))(?:[Ee][+-]?\d+)?$/;
const keywordPattern = /^[A-Za-z_][A-Za-z0-9_\-]*$/;
const repetitionPattern = /^(\d+)\*(.*)$/;

export class GrdeclLexicalError extends Error {
  public readonly code: GrdeclLexicalErrorCode;
  public readonly location: GrdeclLocation;

  public constructor(code: GrdeclLexicalErrorCode, message: string, location: GrdeclLocation) {
    super(message);
    this.name = "GrdeclLexicalError";
    this.code = code;
    this.location = location;
  }
}

export async function* tokenizeGrdecl(
  chunks: AsyncIterable<string> | Iterable<string>,
  options: GrdeclTokenizerOptions = {}
): AsyncGenerator<GrdeclToken> {
  const tokenizer = new GrdeclTokenizer(options);
  for await (const chunk of chunks) {
    for (const token of tokenizer.push(chunk)) {
      yield token;
    }
  }
  for (const token of tokenizer.finish()) {
    yield token;
  }
}

export class GrdeclTokenizer {
  private readonly limits: GrdeclTokenizerLimits;
  private readonly shouldCancel: () => boolean;
  private buffer = "";
  private line = 1;
  private column = 1;
  private offset = 0;
  private tokenCount = 0;
  private numericValueCount = 0;

  public constructor(options: GrdeclTokenizerOptions = {}) {
    this.limits = { ...defaultLimits, ...options.limits };
    this.shouldCancel = options.shouldCancel ?? (() => false);
  }

  public push(chunk: string): GrdeclToken[] {
    if (typeof chunk !== "string") {
      throw this.error("invalid-token", "Tokenizer chunks must be strings.");
    }
    this.buffer += chunk;
    return this.scan(false);
  }

  public finish(): GrdeclToken[] {
    return this.scan(true);
  }

  private scan(isFinal: boolean): GrdeclToken[] {
    const tokens: GrdeclToken[] = [];
    let index = 0;

    while (index < this.buffer.length) {
      this.throwIfCancelled();
      const current = this.buffer[index] ?? "";
      if (isWhitespace(current)) {
        index += 1;
        continue;
      }

      const location = this.currentLocationAfter(index);
      if (current === "-" && this.buffer[index + 1] === "-") {
        const newlineIndex = findNewline(this.buffer, index + 2);
        if (newlineIndex < 0 && !isFinal) {
          break;
        }
        const end = newlineIndex < 0 ? this.buffer.length : newlineIndex;
        const raw = this.buffer.slice(index, end);
        tokens.push(this.emit({ kind: "comment", value: raw.slice(2), raw, location }));
        index = end;
        continue;
      }

      if (current === "/") {
        tokens.push(this.emit({ kind: "slash", raw: "/", location }));
        index += 1;
        continue;
      }

      if (current === "'" || current === "\"") {
        const quoted = this.readQuoted(index, current, isFinal, location);
        if (!quoted) {
          break;
        }
        tokens.push(this.emit(quoted.token));
        index = quoted.end;
        continue;
      }

      const end = findLexemeEnd(this.buffer, index);
      if (end === this.buffer.length && !isFinal) {
        break;
      }
      const raw = this.buffer.slice(index, end);
      tokens.push(this.emit(this.classifyLexeme(raw, location)));
      index = end;
    }

    this.consume(index);
    return tokens;
  }

  private readQuoted(index: number, quote: string, isFinal: boolean, location: GrdeclLocation) {
    let cursor = index + 1;
    while (cursor < this.buffer.length) {
      if (this.buffer[cursor] !== quote) {
        cursor += 1;
        continue;
      }
      if (this.buffer[cursor + 1] === quote) {
        cursor += 2;
        continue;
      }
      const end = cursor + 1;
      const raw = this.buffer.slice(index, end);
      return {
        end,
        token: { kind: "string" as const, raw, value: raw.slice(1, -1).replaceAll(quote + quote, quote), location }
      };
    }

    if (isFinal) {
      throw this.error("unexpected-eof", "Unexpected end of input inside quoted string.", location);
    }
    return undefined;
  }

  private classifyLexeme(raw: string, location: GrdeclLocation): GrdeclToken {
    const repetition = raw.match(repetitionPattern);
    if (repetition) {
      const countText = repetition[1] ?? "";
      const valueText = repetition[2] ?? "";
      const count = Number(countText);
      if (!Number.isSafeInteger(count) || count <= 0) {
        throw this.error("invalid-repetition", `Invalid repetition count: ${raw}`, location);
      }
      if (count > this.limits.maxRepetitionCount) {
        throw this.error("repetition-limit", `Repetition count exceeds ${this.limits.maxRepetitionCount}.`, location);
      }
      if (valueText && !numericPattern.test(valueText)) {
        throw this.error("invalid-repetition", `Invalid repetition value: ${raw}`, location);
      }
      this.reserveNumericValues(count, location);
      return { kind: "repetition", count, value: valueText ? Number(valueText) : undefined, raw, location };
    }

    if (raw.includes("*")) {
      throw this.error("invalid-repetition", `Malformed repetition syntax: ${raw}`, location);
    }
    if (numericPattern.test(raw)) {
      const value = Number(raw);
      if (!Number.isFinite(value)) {
        throw this.error("invalid-number", `Number is not finite: ${raw}`, location);
      }
      this.reserveNumericValues(1, location);
      return { kind: "number", value, raw, location };
    }
    if (looksNumeric(raw)) {
      throw this.error("invalid-number", `Malformed number: ${raw}`, location);
    }
    if (keywordPattern.test(raw)) {
      return { kind: "keyword", value: raw, raw, location };
    }
    throw this.error("invalid-token", `Unrecognized token: ${raw}`, location);
  }

  private emit(token: GrdeclToken): GrdeclToken {
    this.tokenCount += 1;
    if (this.tokenCount > this.limits.maxTokenCount) {
      throw this.error("token-limit", `Token count exceeds ${this.limits.maxTokenCount}.`, token.location);
    }
    return token;
  }

  private reserveNumericValues(count: number, location: GrdeclLocation): void {
    this.numericValueCount += count;
    if (this.numericValueCount > this.limits.maxNumericValues) {
      throw this.error("numeric-array-limit", `Numeric value count exceeds ${this.limits.maxNumericValues}.`, location);
    }
  }

  private consume(count: number): void {
    for (let index = 0; index < count; index += 1) {
      const character = this.buffer[index] ?? "";
      this.offset += 1;
      if (character === "\r") {
        if (this.buffer[index + 1] === "\n" && index + 1 < count) {
          index += 1;
          this.offset += 1;
        }
        this.line += 1;
        this.column = 1;
      } else if (character === "\n") {
        this.line += 1;
        this.column = 1;
      } else {
        this.column += 1;
      }
    }
    this.buffer = this.buffer.slice(count);
  }

  private currentLocationAfter(index: number): GrdeclLocation {
    let line = this.line;
    let column = this.column;
    let offset = this.offset;
    for (let cursor = 0; cursor < index; cursor += 1) {
      const character = this.buffer[cursor] ?? "";
      offset += 1;
      if (character === "\r") {
        if (this.buffer[cursor + 1] === "\n") {
          cursor += 1;
          offset += 1;
        }
        line += 1;
        column = 1;
      } else if (character === "\n") {
        line += 1;
        column = 1;
      } else {
        column += 1;
      }
    }
    return { line, column, offset };
  }

  private throwIfCancelled(): void {
    if (this.shouldCancel()) {
      throw this.error("cancelled", "GRDECL tokenization was cancelled.");
    }
  }

  private error(code: GrdeclLexicalErrorCode, message: string, location = this.currentLocationAfter(0)): GrdeclLexicalError {
    return new GrdeclLexicalError(code, message, location);
  }
}

function isWhitespace(character: string): boolean {
  return character === " " || character === "\t" || character === "\r" || character === "\n";
}

function findNewline(text: string, from: number): number {
  for (let index = from; index < text.length; index += 1) {
    const character = text[index];
    if (character === "\r" || character === "\n") {
      return index;
    }
  }
  return -1;
}

function findLexemeEnd(text: string, from: number): number {
  let index = from;
  while (index < text.length) {
    const character = text[index] ?? "";
    if (isWhitespace(character) || character === "/" || character === "'" || character === "\"") {
      break;
    }
    if (character === "-" && text[index + 1] === "-") {
      break;
    }
    index += 1;
  }
  return index;
}

function looksNumeric(value: string): boolean {
  return /^[+\-.\d]/.test(value);
}