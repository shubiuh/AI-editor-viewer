export const DEFAULT_MAX_READ_SIZE: number;

export const RESERVOIR_FILE_ERROR_CODES: {
  readonly invalidToken: "invalid-token";
  readonly invalidRange: "invalid-range";
  readonly requestTooLarge: "request-too-large";
  readonly fileNotFound: "file-not-found";
  readonly fileChanged: "file-changed";
  readonly rangeOutOfBounds: "range-out-of-bounds";
  readonly readFailed: "read-failed";
  readonly notAFile: "not-a-file";
};

export interface ReservoirFileMetadata {
  readonly token: string;
  readonly fileName: string;
  readonly extension: string;
  readonly size: number;
  readonly modifiedTime: string;
}

export type ReservoirFileErrorCode = (typeof RESERVOIR_FILE_ERROR_CODES)[keyof typeof RESERVOIR_FILE_ERROR_CODES];

export type ReservoirFileResult<T> =
  | { readonly ok: true } & T
  | { readonly ok: false; readonly error: { readonly code: ReservoirFileErrorCode; readonly message: string } };

export interface ReservoirRangeRequest {
  readonly token: string;
  readonly offset: number;
  readonly length: number;
}

export interface ReservoirFileSessionStoreOptions {
  readonly fs: typeof import("node:fs/promises");
  readonly maxReadSize?: number;
  readonly createToken?: () => string;
}

export class ReservoirFileSessionStore {
  public constructor(options: ReservoirFileSessionStoreOptions);
  public registerFilePath(filePath: string): Promise<ReservoirFileResult<{ readonly metadata: ReservoirFileMetadata }>>;
  public readRange(request: ReservoirRangeRequest): Promise<ReservoirFileResult<{ readonly data: ArrayBuffer }>>;
  public release(token: string): ReservoirFileResult<{ readonly released: boolean }>;
  public releaseAll(): void;
}