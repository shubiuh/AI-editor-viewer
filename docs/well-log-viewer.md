# Well-Log Viewer

The two-dimensional well-log viewer is a dependency-free canvas adapter in `src/reservoir/well-log`. It receives `WellLogCurve` typed arrays and a small renderer-layer input that may provide converted TVD arrays. The domain `WellLogCurve` remains independent of canvas, DOM, and VTK.js types.

Each visible curve is one track with a shared vertical depth axis. Tracks support independently configured visibility, linear or logarithmic horizontal scaling, ranges, grid lines, legends, and unit labels. A logarithmic range requires a positive minimum. Missing values are represented by the existing validity mask or `NaN`, and they split plotted polylines rather than being bridged.

The canvas supports click-to-select depth, drag-to-pan, and wheel-to-zoom. It emits a typed `SelectedDepthEvent` through `SelectedDepthController`; the Reservoir workspace connects trajectory MD picks and log cursor selections through the same controller. TVD becomes selectable only when all presented plot curves provide a compatible converted TVD typed array.

`reservoir-demo.html` uses the locally authored synthetic LAS fixture together with the synthetic east/west trajectories. It demonstrates the shared depth selection and the MD/TVD selector without adding a charting library.