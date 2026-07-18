export interface GrdeclLocation {
  readonly line: number;
  readonly column: number;
  readonly offset: number;
}

export interface GrdeclKeywordToken {
  readonly kind: "keyword";
  readonly value: string;
  readonly raw: string;
  readonly location: GrdeclLocation;
}

export interface GrdeclNumberToken {
  readonly kind: "number";
  readonly value: number;
  readonly raw: string;
  readonly location: GrdeclLocation;
}

export interface GrdeclSlashToken {
  readonly kind: "slash";
  readonly raw: "/";
  readonly location: GrdeclLocation;
}

export interface GrdeclCommentToken {
  readonly kind: "comment";
  readonly value: string;
  readonly raw: string;
  readonly location: GrdeclLocation;
}

export interface GrdeclStringToken {
  readonly kind: "string";
  readonly value: string;
  readonly raw: string;
  readonly location: GrdeclLocation;
}

export interface GrdeclRepetitionToken {
  readonly kind: "repetition";
  readonly count: number;
  readonly value: number | undefined;
  readonly raw: string;
  readonly location: GrdeclLocation;
}

export type GrdeclToken =
  | GrdeclKeywordToken
  | GrdeclNumberToken
  | GrdeclSlashToken
  | GrdeclCommentToken
  | GrdeclStringToken
  | GrdeclRepetitionToken;

export type GrdeclLexicalErrorCode =
  | "cancelled"
  | "invalid-token"
  | "invalid-number"
  | "invalid-repetition"
  | "unexpected-eof"
  | "token-limit"
  | "repetition-limit"
  | "numeric-array-limit";

export interface GrdeclTokenizerLimits {
  readonly maxTokenCount: number;
  readonly maxRepetitionCount: number;
  readonly maxNumericValues: number;
}

export interface GrdeclTokenizerOptions {
  readonly limits?: Partial<GrdeclTokenizerLimits>;
  readonly shouldCancel?: () => boolean;
}