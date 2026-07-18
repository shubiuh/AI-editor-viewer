# Reservoir File Access

Future reservoir parsers access files through three explicit Electron preload methods: `reservoirFiles.open`, `reservoirFiles.readRange`, and `reservoirFiles.release`. The renderer never receives a filesystem path and cannot submit a path for reading.

`open` shows a main-process dialog and returns metadata plus an opaque session token. `readRange` accepts only that token, a non-negative byte offset, and a bounded byte length. The main process checks the token, maximum request size, file existence, unchanged size and modified time, and file bounds before reading.

Reads return an `ArrayBuffer` through IPC, never base64 text. Tokens are released explicitly or when the application quits. Structured errors include invalid token, invalid range, oversized request, missing or changed file, out-of-bounds range, and read failure.

This infrastructure deliberately does not parse EGRID, INIT, UNRST, GRDECL, or any other reservoir format.