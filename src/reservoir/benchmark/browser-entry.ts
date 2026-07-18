import "@kitware/vtk.js/Rendering/Profiles/Geometry";

import { extractReservoirSurface } from "../geometry/surface-extractor";
import { ReservoirViewer } from "../rendering/reservoir-viewer";
import { createOrthogonalCornerPointGeometry } from "../testing/fixtures/generators";

const viewport = document.querySelector<HTMLElement>("#reservoir-benchmark-viewport");
const resultElement = document.querySelector<HTMLOutputElement>("#reservoir-benchmark-result");
const jsonButton = document.querySelector<HTMLButtonElement>("#download-json");
const markdownButton = document.querySelector<HTMLButtonElement>("#download-markdown");

if (!viewport || !resultElement || !jsonButton || !markdownButton) {
  throw new Error("Browser benchmark page is missing required elements.");
}

const dimensions = new URLSearchParams(location.search).get("size") === "medium" ? [316, 316, 1] as const : [100, 100, 1] as const;
const [nx, ny, nz] = dimensions;
const totalCellCount = nx * ny * nz;
const fixtureStarted = performance.now();
const geometry = createOrthogonalCornerPointGeometry({
  gridId: "browser-benchmark",
  displayName: "Browser benchmark",
  dimensions: { nx, ny, nz, totalCellCount },
  origin: [500_000, 6_500_000, 1_000],
  cellSize: [10, 10, 2]
});
const fixtureGenerationMs = performance.now() - fixtureStarted;
const extractionStarted = performance.now();
const extraction = extractReservoirSurface({ kind: "corner-point", geometry });
if (extraction.status !== "completed") {
  throw new Error("Browser benchmark surface extraction did not complete.");
}
const geometryExtractionMs = performance.now() - extractionStarted;
const viewer = new ReservoirViewer();
viewer.attach(viewport);
const firstRenderStarted = performance.now();
viewer.setGeometry({ surface: extraction.geometry, dimensions: geometry.dimensions, localOrigin: [500_000, 6_500_000, 1_000] });
await nextAnimationFrame();
const firstRenderMs = performance.now() - firstRenderStarted;
const report = {
  generatedAt: new Date().toISOString(),
  environment: { userAgent: navigator.userAgent, devicePixelRatio: window.devicePixelRatio },
  cells: totalCellCount,
  dimensions,
  fixtureGenerationMs,
  geometryExtractionMs,
  firstRenderMs,
  notes: [
    "firstRenderMs measures ReservoirViewer.setGeometry through the next browser animation frame.",
    "This browser harness does not claim GPU memory because browsers do not expose a reliable cross-browser GPU memory API."
  ]
};
resultElement.textContent = JSON.stringify(report, null, 2);
jsonButton.addEventListener("click", () => download("reservoir-browser-first-render.json", "application/json", `${JSON.stringify(report, null, 2)}\n`));
markdownButton.addEventListener("click", () => download("reservoir-browser-first-render.md", "text/markdown", markdown(report)));
window.addEventListener("beforeunload", () => viewer.dispose(), { once: true });

function nextAnimationFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function download(fileName: string, type: string, contents: string): void {
  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(new Blob([contents], { type }));
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(anchor.href);
}

function markdown(value: typeof report): string {
  return `# Reservoir Browser First-Render Benchmark\n\n| Cells | Fixture generation | Geometry extraction | First render |\n| ---: | ---: | ---: | ---: |\n| ${value.cells.toLocaleString()} | ${value.fixtureGenerationMs.toFixed(1)} ms | ${value.geometryExtractionMs.toFixed(1)} ms | ${value.firstRenderMs.toFixed(1)} ms |\n\n${value.notes.map((note) => `- ${note}`).join("\n")}\n`;
}