const crypto = require("node:crypto");

const DEFAULT_MAX_READ_SIZE = 16 * 1024 * 1024;

const RESERVOIR_FILE_ERROR_CODES = Object.freeze({
  invalidToken: "invalid-token",
  invalidRange: "invalid-range",
  requestTooLarge: "request-too-large",
  fileNotFound: "file-not-found",
  fileChanged: "file-changed",
  rangeOutOfBounds: "range-out-of-bounds",
  readFailed: "read-failed",
  notAFile: "not-a-file"
});

class ReservoirFileSessionStore {
  constructor(options) {
    this.fs = options.fs;
    this.maxReadSize = options.maxReadSize ?? DEFAULT_MAX_READ_SIZE;
    this.createToken = options.createToken ?? (() => crypto.randomUUID());
    this.sessions = new Map();
  }

  async registerFilePath(filePath) {
    try {
      const stat = await this.fs.stat(filePath);
      if (!stat.isFile()) {
        return failure(RESERVOIR_FILE_ERROR_CODES.notAFile, "The selected item is not a file.");
      }

      const token = `reservoir-${this.createToken()}`;
      const metadata = createMetadata(token, filePath, stat);
      this.sessions.set(token, { filePath, size: stat.size, modifiedTimeMs: stat.mtimeMs, metadata });
      return { ok: true, metadata };
    } catch (error) {
      return failureFromFileError(error);
    }
  }

  async readRange(request) {
    if (!isRangeRequest(request)) {
      return failure(RESERVOIR_FILE_ERROR_CODES.invalidRange, "A token, non-negative byte offset, and byte length are required.");
    }

    const session = this.sessions.get(request.token);
    if (!session) {
      return failure(RESERVOIR_FILE_ERROR_CODES.invalidToken, "The reservoir file token is unknown or has been released.");
    }

    if (request.length > this.maxReadSize) {
      return failure(RESERVOIR_FILE_ERROR_CODES.requestTooLarge, `Requested range exceeds the ${this.maxReadSize} byte limit.`);
    }

    let stat;
    try {
      stat = await this.fs.stat(session.filePath);
    } catch (error) {
      this.sessions.delete(request.token);
      return failureFromFileError(error);
    }

    if (!stat.isFile()) {
      this.sessions.delete(request.token);
      return failure(RESERVOIR_FILE_ERROR_CODES.fileNotFound, "The selected reservoir file is no longer available.");
    }

    if (stat.size !== session.size || stat.mtimeMs !== session.modifiedTimeMs) {
      return failure(RESERVOIR_FILE_ERROR_CODES.fileChanged, "The reservoir file changed after it was selected. Select it again.");
    }

    if (request.offset + request.length > stat.size) {
      return failure(RESERVOIR_FILE_ERROR_CODES.rangeOutOfBounds, "Requested bytes extend beyond the reservoir file size.");
    }

    let handle;
    try {
      handle = await this.fs.open(session.filePath, "r");
      const bytes = new Uint8Array(request.length);
      const result = await handle.read(bytes, 0, request.length, request.offset);
      if (result.bytesRead !== request.length) {
        return failure(RESERVOIR_FILE_ERROR_CODES.readFailed, "The requested reservoir byte range could not be read completely.");
      }
      return { ok: true, data: bytes.buffer };
    } catch (error) {
      return failureFromFileError(error);
    } finally {
      await handle?.close();
    }
  }

  release(token) {
    if (typeof token !== "string" || !token) {
      return failure(RESERVOIR_FILE_ERROR_CODES.invalidToken, "A valid reservoir file token is required.");
    }
    return { ok: true, released: this.sessions.delete(token) };
  }

  releaseAll() {
    this.sessions.clear();
  }
}

function createMetadata(token, filePath, stat) {
  const path = require("node:path");
  return {
    token,
    fileName: path.basename(filePath),
    extension: path.extname(filePath).toLowerCase(),
    size: stat.size,
    modifiedTime: new Date(stat.mtimeMs).toISOString()
  };
}

function isRangeRequest(request) {
  return request
    && typeof request.token === "string"
    && Number.isSafeInteger(request.offset)
    && request.offset >= 0
    && Number.isSafeInteger(request.length)
    && request.length >= 0;
}

function failure(code, message) {
  return { ok: false, error: { code, message } };
}

function failureFromFileError(error) {
  if (error && error.code === "ENOENT") {
    return failure(RESERVOIR_FILE_ERROR_CODES.fileNotFound, "The selected reservoir file no longer exists.");
  }
  return failure(RESERVOIR_FILE_ERROR_CODES.readFailed, "The reservoir file could not be accessed.");
}

module.exports = {
  DEFAULT_MAX_READ_SIZE,
  RESERVOIR_FILE_ERROR_CODES,
  ReservoirFileSessionStore
};