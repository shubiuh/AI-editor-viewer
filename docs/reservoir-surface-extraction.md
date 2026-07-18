# Reservoir Surface Extraction

`src/reservoir/geometry` converts structured cell corners or normalized corner-point geometry into typed render buffers. It has no vtk.js or Electron dependency.

## Face Selection

The extractor visits active cells in deterministic structured cell-ID order and faces in local order: `I-`, `I+`, `J-`, `J+`, `K-`, `K+`. A candidate face is retained when it has no neighbor, has an inactive neighbor, or has an active neighbor whose four face corners do not match as an unordered set within the continuity tolerance. Continuous active-neighbor faces are omitted.

Face categories are `exterior`, `inactive-neighbor boundary`, and `fault/discontinuity`. Neighbor IDs are local structured IDs; exterior faces use `-1`.

## Tolerances and Degeneracy

The default continuity tolerance is $10^{-8}$ in source coordinate units, compared independently on XYZ components. The default degeneracy area tolerance is $10^{-12}$ in squared coordinate units. Degenerate quads are skipped safely and recorded in geometry statistics.

## Output and Transfer

Outputs use typed arrays: Float64 point coordinates, Uint32 connectivity and polygon offsets, typed face metadata, and the original-cell-ID array representation of the source. Point coordinates are intentionally not rebased here; rendering adapters apply the documented local-origin transform before Float32 WebGL upload.

## Cancellation and Progress

Extraction accepts an `AbortSignal` or `shouldCancel` callback and returns a `cancelled` outcome instead of partial geometry. Progress callbacks report `classify` and `emit` phases without any UI dependency, which makes the API ready to invoke from a future worker boundary.

## Benchmark Scaffold

`npm run benchmark:surface` runs a smoke benchmark over a deterministic `24 x 24 x 8` orthogonal grid. It verifies output correctness but deliberately has no timing threshold, avoiding hardware-dependent pass/fail behavior.