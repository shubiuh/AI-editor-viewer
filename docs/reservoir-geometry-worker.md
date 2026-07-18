# Reservoir Geometry Worker

`src/reservoir/geometry/surface-extraction.worker.ts` adapts the pure surface extractor to a dedicated browser worker. It is not connected to Electron IPC.

## Protocol

Every message has a request ID and schema version `1`. The worker accepts `extract-surface` requests and `cancel-extraction` requests. It emits `progress`, `success`, `cancelled`, or structured `error` messages. Progress uses the extractor's `classify` and `emit` phases.

The client rejects responses from an earlier worker generation, so messages delivered after a worker restart cannot resolve a new task. A cancellation request is posted before the client terminates the current worker. Termination guarantees prompt cancellation even though synchronous extraction cannot receive a second event-loop message mid-loop; the next extraction automatically initializes a fresh worker.

## Buffer Ownership

Requests contain typed arrays and never contain base64 data or per-cell JavaScript object payloads. When a typed-array view owns its entire `ArrayBuffer`, the client transfers that buffer to the worker. The sender's view becomes detached and must not be reused. Views into a larger shared buffer are not transferred because detaching the full backing buffer could invalidate unrelated data.

Successful worker responses transfer complete output buffers back to the client using the same ownership rule. `SharedArrayBuffer` is not transferred. Callers that must retain input arrays should provide separate owned buffers before submitting work.

## Failure Handling

If browser Worker initialization fails, `SurfaceWorkerInitializationError` reports a retry-oriented fallback message. Worker runtime errors are surfaced as structured `SurfaceWorkerRemoteError` values. Direct calls to `extractReservoirSurface` remain available for deterministic unit tests and non-worker contexts.