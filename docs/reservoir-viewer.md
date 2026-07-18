# Reservoir Viewer

`ReservoirViewer` is a vtk.js adapter in `src/reservoir/rendering`. It consumes the renderer-layer surface contract and does not add vtk.js types to the reservoir domain.

## API

The viewer provides `attach`, `setGeometry`, `setProperty`, `setVisibility`, `setIJKClip`, `setRepresentation`, `resetCamera`, `setGeologicalView`, `pick`, `resize`, `clear`, and `dispose`.

Geometry changes, clipping, and face-category visibility rebuild the vtk.js polydata. Property changes update only point scalar arrays and lookup-table state, preserving geometry topology. Undefined values become `NaN` scalars; their lookup-table color is configurable and becomes transparent when `undefinedVisible` is `false`.

## Coordinates and Picking

The render plan subtracts the case local origin before creating Float32 vtk.js points. Picking maps vtk.js cell IDs through visible face indices back to original cell IDs, structured IJK, property values, and a world coordinate reconstructed by adding the local origin.

## Demo

Run `npm run dev` and open `/reservoir-demo.html`. The page renders the independent synthetic `3 x 2 x 2` fixture, displays property coloring, supports selected geological camera presets, and toggles edges. It does not modify the legacy VTK viewer workflow.