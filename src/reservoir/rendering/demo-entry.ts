import "@kitware/vtk.js/Rendering/Profiles/Geometry";

import { extractReservoirSurface } from "../geometry/surface-extractor";
import { ReservoirViewer } from "./reservoir-viewer";
import { createThreeByTwoByTwoPropertyFixture } from "../testing/fixtures";

const viewport = document.querySelector<HTMLElement>("#reservoir-demo-viewport");
const status = document.querySelector<HTMLElement>("#reservoir-demo-status");

if (!viewport || !status) {
  throw new Error("Reservoir demo elements are missing.");
}

const fixture = createThreeByTwoByTwoPropertyFixture();
if (fixture.grid.kind !== "corner-point") {
  throw new Error("Synthetic fixture invariant failed.");
}
const extraction = extractReservoirSurface({ kind: "corner-point", geometry: fixture.grid.geometry });
if (extraction.status !== "completed") {
  throw new Error("Synthetic surface extraction failed.");
}

const viewer = new ReservoirViewer();
viewer.attach(viewport);
viewer.setGeometry({
  surface: extraction.geometry,
  dimensions: fixture.expected.dimensions,
  localOrigin: fixture.localOrigin,
  ...(fixture.grid.geometry.activityMask ? { activityMask: fixture.grid.geometry.activityMask } : {})
});
viewer.setProperty({
  values: fixture.property?.frame.values ?? new Float32Array(),
  ...(fixture.property?.frame.validityMask ? { validityMask: fixture.property.frame.validityMask } : {}),
  ...(fixture.expected.scalarRange ? { range: fixture.expected.scalarRange } : {}),
  undefinedVisible: true
});
viewer.setRepresentation("surface-with-edges");
viewer.setGeologicalView("isometric");
status.textContent = `Synthetic 3x2x2: ${extraction.geometry.statistics.emittedFaceCount} visible faces`;

document.querySelectorAll<HTMLButtonElement>("[data-geological-view]").forEach((button) => {
  button.addEventListener("click", () => {
    const view = button.dataset.geologicalView;
    if (view) {
      viewer.setGeologicalView(view as Parameters<ReservoirViewer["setGeologicalView"]>[0]);
    }
  });
});

document.querySelector("#reservoir-demo-edges")?.addEventListener("change", (event) => {
  const enabled = (event.target as HTMLInputElement).checked;
  viewer.setRepresentation(enabled ? "surface-with-edges" : "surface");
});

window.addEventListener("beforeunload", () => viewer.dispose(), { once: true });