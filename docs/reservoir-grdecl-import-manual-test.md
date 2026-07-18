# Reservoir GRDECL Import Manual Checklist

1. Start the Electron application, select the Reservoir tab, and choose **Open ASCII Grid**.
2. Select `tests/fixtures/grdecl/semantic-1x1x1.grdecl`. Confirm the view shows one active cell with six visible faces.
3. Confirm the Model panel shows dimensions, total/active cells, bounds, parsed property names, parsing duration, geometry duration, and warning count.
4. Select `PORO` from the property menu and confirm the rendered cell receives a scalar color.
5. Import a deck containing a safely slash-terminated unknown keyword. Confirm its parser warning is displayed while the grid still renders.
6. Import a malformed deck. Confirm the UI reports a **Parsing error** with a source location and does not replace the previously completed result.
7. Temporarily cause geometry-worker initialization or extraction to fail. Confirm the UI labels it as a **Geometry error**, distinct from parser errors.
8. Start importing a larger ASCII deck, select **Cancel**, and confirm progress stops, both workers are cancelled, and the file can be renamed or deleted immediately afterward.
9. Start importing one deck, then immediately choose a second deck. Confirm only the second deck reaches the viewer and its statistics/properties replace the first deck.
10. Open developer tools while importing a large deck. Confirm the renderer remains responsive and no full-file base64 payload appears in IPC traffic.

The importer intentionally accepts only ASCII `.grdecl`, `.grid`, and `.data` files. `INCLUDE` and binary Eclipse formats are not supported.