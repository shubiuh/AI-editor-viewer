# Reservoir Viewer

`ReservoirViewer` is a vtk.js adapter in `src/reservoir/rendering`. It consumes the renderer-layer surface contract and does not add vtk.js types to the reservoir domain.

## API

The viewer provides `attach`, `setGeometry`, `setWells`, `setProperty`, `setVisibility`, `setIJKClip`, `setRepresentation`, `resetCamera`, `setGeologicalView`, `pick`, `resize`, `clear`, and `dispose`.

Geometry changes, clipping, and face-category visibility rebuild the vtk.js reservoir polydata. Property changes update only point scalar arrays and lookup-table state, preserving geometry topology. `setWells` rebuilds only the independent well actor layer, never the reservoir surface. Undefined values become `NaN` scalars; their lookup-table color is configurable and becomes transparent when `undefinedVisible` is `false`.

## Coordinates and Picking

The render plan subtracts the case local origin before creating Float32 vtk.js points. Well trajectories retain Float64 world coordinates in the domain and use the same origin-rebased local rendering coordinates. Per-well controls support visibility, color, line or tube mode, radius, world-anchored name labels, MD tick marks, and optional clipping to reservoir bounds. Picking a trajectory returns its nearest stored survey station, measured depth, and preserved Float64 world coordinate. Reservoir-face picking maps vtk.js cell IDs through visible face indices back to original cell IDs, structured IJK, property values, and a reconstructed world coordinate.

## Demo

Run `npm run dev` and open `/reservoir-demo.html`. The page renders the independent synthetic `3 x 2 x 2` fixture with two crossing well trajectories, property coloring, selected geological camera presets, and edge toggling. It does not modify the legacy VTK viewer workflow.