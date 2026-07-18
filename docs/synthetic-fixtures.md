# Synthetic Reservoir Fixtures

The fixtures in `src/reservoir/testing/fixtures` are generated from deterministic formulas. They do not download, include, or derive from external reservoir test files.

## Valid Fixtures

- `orthogonal-1x1x1`: one active orthogonal cell.
- `orthogonal-2x2x2`: eight active orthogonal cells with known centers and 24 exterior faces.
- `orthogonal-3x2x2-inactive`: twelve cells, with cell ID `1` inactive and a static scalar frame.
- `faulted-corner-point`: two cells with a deliberate two-unit vertical pillar and depth discontinuity.
- `pinched-cell`: a valid zero-thickness geometry case for downstream degeneracy handling.
- `large-map-coordinates`: map-scale coordinates near easting `500000` and northing `6500000` for local-origin rebasing checks.

Each fixture carries expected dimensions, total and active counts, bounds, exterior face count, original cell IDs, scalar range or `null`, and selected IJK/cell-center pairs. Structured IDs use:

$$
\mathrm{cellId} = i + n_x \left(j + n_y k\right)
$$

## Invalid Fixtures

The generator also exposes intentionally invalid corner-depth, activity-mask, coordinate, dimension, and property-frame candidates. Tests pass them through the same runtime validators used by the domain contract.

## Descriptions and Payloads

`descriptions.json` contains only small human-readable fixture summaries. Geometry, masks, connectivity, and property values are generated programmatically as typed arrays, so test payloads remain reproducible and suitable for future worker-transfer tests.