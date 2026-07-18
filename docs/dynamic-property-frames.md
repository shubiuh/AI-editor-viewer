# Dynamic Property Frames

Dynamic reservoir properties are format-independent. A `PropertyFrameProvider` exposes a property catalog, a time-step catalog, and asynchronous `loadFrame` requests. Providers return repository `PropertyFrame` typed arrays and do not depend on VTK.js, GRDECL, UNRST, or renderer objects.

`PropertyFrameCache` deduplicates equal `(propertyId, timeStepIndex)` loads, supports per-consumer cancellation, maintains an access-ordered LRU cache, and enforces a configurable byte budget. Cache statistics report current bytes, entry count, in-flight requests, hits, misses, and evictions. Each successful frame request schedules adjacent time-step prefetches. Performance samples record cache hits, completed loads, cancellation, failures, and load duration.

`DynamicPropertyController` owns selected property/time step and rejects stale responses with a request generation. It drives `ReservoirViewer.setProperty`, which updates scalar values without rebuilding reservoir geometry. Playback supports speed in frames per second, `drop` or `queue` behavior for ticks arriving while a load is active, and `skip` or `pause` behavior for missing frames. Any unrecoverable load error pauses playback.

The Reservoir tab includes an **Enable Synthetic Frames** control after a grid is loaded. The synthetic provider supplies pressure and water-saturation frames for the grid's cell count, exposes a twelve-step catalog, and displays memory/cache/performance statistics. It is a demonstration provider only; UNRST parsing is intentionally not implemented.