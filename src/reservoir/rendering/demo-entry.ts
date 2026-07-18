import "@kitware/vtk.js/Rendering/Profiles/Geometry";

import { extractReservoirSurface } from "../geometry/surface-extractor";
import { ReservoirViewer } from "./reservoir-viewer";
import { createSyntheticCrossingWellTrajectories, createSyntheticLasFixture, createThreeByTwoByTwoPropertyFixture } from "../testing/fixtures";
import { defaultWellTrajectoryRenderSettings } from "./trajectory-render-plan";
import { SelectedDepthController, WellLogViewer, supportsDepthMode, type WellLogPlotCurve } from "../well-log";

const viewport = document.querySelector<HTMLElement>("#reservoir-demo-viewport");
const status = document.querySelector<HTMLElement>("#reservoir-demo-status");
const logViewport = document.querySelector<HTMLElement>("#reservoir-demo-log-viewport");
const depthMode = document.querySelector<HTMLSelectElement>("#reservoir-demo-depth-mode");

if (!viewport || !status || !logViewport || !depthMode) {
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
const selectedDepth = new SelectedDepthController();
const logViewer = new WellLogViewer(logViewport, { onSelectedDepth: (event) => selectedDepth.set(event) });
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
viewer.setWells(createSyntheticCrossingWellTrajectories().map((trajectory, index) => ({
  trajectory,
  settings: {
    ...defaultWellTrajectoryRenderSettings(trajectory.wellId, index === 0 ? [0.96, 0.42, 0.18] : [0.18, 0.82, 0.71]),
    radius: 0.7,
    showMdTicks: true,
    mdTickInterval: 10,
    clipToReservoirBounds: false
  }
})));
viewer.setGeologicalView("isometric");
const syntheticLas = createSyntheticLasFixture();
const logCurves: WellLogPlotCurve[] = syntheticLas.curves.map((curve, index) => {
  const tvdDepths = syntheticLas.tvdDepthsByMnemonic.get(curve.mnemonic);
  return {
    curve,
    ...(tvdDepths ? { tvdDepths } : {}),
    color: index === 0 ? [0.96, 0.42, 0.18] : [0.18, 0.82, 0.71]
  };
});
logViewer.setCurves(logCurves);
depthMode.disabled = !supportsDepthMode(logCurves, "tvd");
selectedDepth.subscribe((event) => {
  logViewer.setSelectedDepth(event);
  status.textContent = `Synthetic 3x2x2: 2 crossing wells | ${event.depthMode.toUpperCase()} ${event.depth.toFixed(2)} m selected`;
});
status.textContent = `Synthetic 3x2x2: ${extraction.geometry.statistics.emittedFaceCount} visible faces, 2 crossing wells`;

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

depthMode.addEventListener("change", () => logViewer.setDepthMode(depthMode.value as "md" | "tvd"));

viewport.addEventListener("click", (event) => {
  const bounds = viewport.getBoundingClientRect();
  const picked = viewer.pick(event.clientX - bounds.left, event.clientY - bounds.top);
  if (picked && "wellId" in picked) {
    selectedDepth.set({ source: "reservoir", depthMode: "md", depth: picked.measuredDepth });
  }
});

window.addEventListener("beforeunload", () => {
  logViewer.dispose();
  viewer.dispose();
}, { once: true });