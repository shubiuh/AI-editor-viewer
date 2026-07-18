# Reservoir Data Contract

## Scope

`src/reservoir/domain` defines versioned, renderer-independent data transferred between parsers, workers, domain services, and rendering adapters. It has no Electron or vtk.js dependency. The current supported contract is schema major version `1`; readers may accept compatible `1.x.y` documents and must reject unsupported major versions.

## Grid and Cell Convention

Structured grids use i-fastest cell ordering:

$$
\mathrm{cellId} = i + n_x \left(j + n_y k\right)
$$

`CornerPointGridGeometry` stores six Float64 values per pillar and eight Float64 corner depths per cell. `ExplicitCellGeometry` stores flattened xyz points, `Uint32Array` connectivity, `Uint32Array` cell offsets, `Uint8Array` cell types, and original cell IDs. Original IDs are mandatory and must survive conversion, extraction, and picking.

## Values, Time, and Missing Data

Large numeric data uses typed arrays only. Property and well-log descriptors declare their value type and a discriminated missing-value representation: no missing values, `NaN`, a numeric sentinel, or a `Uint8Array` validity mask. Dynamic property frames identify both a property and a time-step. Time is either an ISO timestamp or a numeric simulation time with a unit.

## Coordinates

Case metadata stores a Float64-compatible local origin and coordinate-reference metadata. Parsers retain source coordinates in Float64 where needed. Rendering adapters must subtract the documented local origin before converting positions to Float32 for WebGL, and must restore the origin for exported or queried world coordinates.

## Binary Transfer

Typed-array buffers are intended for worker transfer using `ArrayBuffer` transfer lists. Transfer ownership rather than cloning buffers when the sender no longer needs them. Do not transfer a buffer shared by another active typed-array view. Domain records contain typed arrays and metadata only; renderer-specific objects belong outside this contract.

## Versioning Rules

- Add optional fields in a compatible minor version.
- Do not rename, reinterpret, or change typed-array layout in a compatible version.
- Introduce a new major version for incompatible layouts, cell ordering, coordinate conventions, or null-value semantics.
- Parsers must record the public specification or licensed SDK that defines each source format outside this contract.