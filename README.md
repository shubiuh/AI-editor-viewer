# AI Editor Viewer

A lightweight Electron code editor with local 3D visualization for legacy VTK files and an embedded Kitware Glance viewer for additional scientific formats.

## Features

- Monaco-based editor with themes, minimap, wrapping, find, and command palette
- Full-size render-area tabs for **Editor**, **VTK**, and **Glance**
- Local legacy ASCII `.vtk` support for `POLYDATA` and common unstructured-grid cells
- Embedded Glance viewer for formats such as `.vtp`, `.vti`, `.vtkjs`, `.stl`, `.obj`, and `.ply`
- Resizable workspace dock and floating panels

## Run

```bash
npm install
npm run dev
```

The development app uses Vite at `http://127.0.0.1:5173` and opens Electron after the server is ready.

## Build

```bash
npm run build
npm run package:win
```

`npm run build` creates the renderer in `dist/`. `npm run package:win` creates a Windows installer and portable build in `release/`.

## VTK Support

The **VTK** tab is intended for legacy `.vtk` datasets. It supports `POLYDATA` and converts common unstructured-grid cells into renderable faces, including tetrahedra.

The **Glance** tab is embedded locally and provides a richer viewer for its supported formats. Its **VTK Tetra View** selector keeps both workflows available: **Geometry** uses the ITK reader and retains Surface, Surface with edges, Wireframe, and Points; **Volume** resamples legacy ASCII or big-endian binary linear tetrahedral grids to a regular scalar volume and uses Glance's native GPU ray caster. Switching the selector replaces the current VTK source automatically. Other legacy `.vtk` files continue through the ITK geometry reader, and the sample catalog is hidden from the embedded interface.

The tetra-to-volume conversion uses 128 samples along the longest axis by default (capped at two million voxels). This is browser volume rendering of a resampled regular grid, so it is visually comparable to ParaView's Volume representation but is not ParaView's projected-tetra mapper. The resolution can be changed before opening a file from the Glance frame console with `GlanceTetraVolume.setResolution(160)` (valid range: 32–256).

## Third-Party Software

The embedded Glance assets are derived from [Kitware Glance](https://github.com/Kitware/glance), distributed under the BSD 3-Clause License.
