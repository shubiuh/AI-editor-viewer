import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import vtkActor from "@kitware/vtk.js/Rendering/Core/Actor";
import vtkCellArray from "@kitware/vtk.js/Common/Core/CellArray";
import vtkMapper from "@kitware/vtk.js/Rendering/Core/Mapper";
import vtkPoints from "@kitware/vtk.js/Common/Core/Points";
import vtkPolyData from "@kitware/vtk.js/Common/DataModel/PolyData";

import { parseGrdecl } from "../src/reservoir/formats/grdecl";
import { extractReservoirSurface } from "../src/reservoir/geometry/surface-extractor";
import { collectSurfaceGeometryTransferables, collectSurfaceInputTransferables } from "../src/reservoir/geometry/worker-transfer";
import { createPropertyScalarPlan, createReservoirRenderPlan } from "../src/reservoir/rendering/render-plan";
import { findNearestTrajectoryStation } from "../src/reservoir/rendering/trajectory-render-plan";
import { createOrthogonalCornerPointGeometry } from "../src/reservoir/testing/fixtures/generators";
import { createExplicitWellTrajectory } from "../src/reservoir/wells";
import type { ReservoirSurfaceGeometry, StructuredSurfaceInput } from "../src/reservoir/geometry/types";

interface BenchmarkCase {
  readonly name: "small" | "medium" | "large";
  readonly dimensions: readonly [number, number, number];
}

interface StageMeasurement {
  readonly milliseconds: number | null;
  readonly status: "measured" | "not-measured" | "skipped";
  readonly note?: string;
}

interface BenchmarkResult {
  readonly case: BenchmarkCase["name"];
  readonly cells: number;
  readonly stages: Record<string, StageMeasurement>;
  readonly transferredBytes: { readonly input: number; readonly output: number };
  readonly typedArrayBytes: Record<string, number>;
  readonly estimatedPeakBytes: number;
  readonly processMemory: { readonly heapUsed: number; readonly arrayBuffers: number };
  readonly thresholdFailures: readonly string[];
}

const outputDirectory = fileURLToPath(new URL("./results/", import.meta.url));
const thresholdPath = fileURLToPath(new URL("./reservoir-performance.thresholds.json", import.meta.url));

describe("reservoir performance benchmark", () => {
  it("measures repeatable pipeline stages and writes JSON/Markdown reports", async () => {
    const thresholds = JSON.parse(await readFile(thresholdPath, "utf8")) as Record<string, Record<string, number>>;
    const results: BenchmarkResult[] = [];
    for (const benchmarkCase of benchmarkCases()) {
      results.push(await runCase(benchmarkCase, thresholds[benchmarkCase.name]));
    }
    await writeReports(results);
    const failures = results.flatMap((result) => result.thresholdFailures.map((failure) => `${result.case}: ${failure}`));
    if (process.env.BENCH_ASSERT === "1") {
      expect(failures).toEqual([]);
    }
    expect(results.length).toBeGreaterThanOrEqual(2);
  });
});

async function runCase(benchmarkCase: BenchmarkCase, thresholds: Record<string, number> | undefined): Promise<BenchmarkResult> {
  const [nx, ny, nz] = benchmarkCase.dimensions;
  const totalCellCount = nx * ny * nz;
  const stages: Record<string, StageMeasurement> = {};
  const fixture = measure(() => createOrthogonalCornerPointGeometry({
    gridId: `benchmark-${benchmarkCase.name}`,
    displayName: `Benchmark ${benchmarkCase.name}`,
    dimensions: { nx, ny, nz, totalCellCount },
    origin: [500_000, 6_500_000, 1_000],
    cellSize: [10, 10, 2]
  }));
  stages.fixtureGeneration = fixture.measurement;
  const input: StructuredSurfaceInput = { kind: "corner-point", geometry: fixture.value };
  const parsed = await measureAsync(() => parseGrdecl([createCompactGrdecl(nx, ny, nz)]));
  stages.parsing = parsed.measurement;
  const extracted = measure(() => extractReservoirSurface(input));
  stages.geometryExtraction = extracted.measurement;
  if (extracted.value.status !== "completed") {
    throw new Error(`Surface extraction did not complete for ${benchmarkCase.name}.`);
  }
  const surface = extracted.value.geometry;
  const workerTransfer = measure(() => ({
    input: transferableBytes(collectSurfaceInputTransferables(input)),
    output: transferableBytes(collectSurfaceGeometryTransferables(surface))
  }));
  stages.workerTransferPreparation = workerTransfer.measurement;
  const renderGeometry = { surface, dimensions: fixture.value.dimensions, localOrigin: [500_000, 6_500_000, 1_000] as const };
  const renderPlan = measure(() => createReservoirRenderPlan(renderGeometry));
  stages.renderPlan = renderPlan.measurement;
  stages.vtkDatasetConstruction = measureVtkDatasetConstruction(renderPlan.value);
  stages.firstRender = {
    milliseconds: null,
    status: "not-measured",
    note: "Node benchmark has no reliable WebGL/GPU timing API; no GPU timing or memory is claimed."
  };
  const property = new Float32Array(totalCellCount);
  property.fill(0.2);
  stages.propertyUpdate = measure(() => createPropertyScalarPlan(renderPlan.value, { values: property, undefinedVisible: true })).measurement;
  const trajectory = createBenchmarkTrajectory();
  stages.picking = measure(() => findNearestTrajectoryStation(trajectory, [100, 50, 20], [0, 0, 0])).measurement;
  const typedArrayBytes = {
    fixtureInput: typedArrayBytesOf(fixture.value),
    parsedCase: typedArrayBytesOf(parsed.value.reservoirCase),
    surface: typedArrayBytesOf(surface),
    renderPlan: typedArrayBytesOf(renderPlan.value),
    property: property.byteLength
  };
  const estimatedPeakBytes = typedArrayBytes.fixtureInput + typedArrayBytes.parsedCase + typedArrayBytes.surface + typedArrayBytes.renderPlan + typedArrayBytes.property;
  const thresholdFailures = evaluateThresholds(stages, thresholds);
  return {
    case: benchmarkCase.name,
    cells: totalCellCount,
    stages,
    transferredBytes: workerTransfer.value,
    typedArrayBytes,
    estimatedPeakBytes,
    processMemory: { heapUsed: process.memoryUsage().heapUsed, arrayBuffers: process.memoryUsage().arrayBuffers },
    thresholdFailures
  };
}

function benchmarkCases(): BenchmarkCase[] {
  const cases: BenchmarkCase[] = [
    { name: "small", dimensions: [100, 100, 1] },
    { name: "medium", dimensions: [316, 316, 1] }
  ];
  const largeMode = process.env.BENCHMARK_LARGE ?? "auto";
  const availableMemory = process.availableMemory?.() ?? 0;
  const enoughMemory = availableMemory > 6 * 1024 ** 3;
  if (largeMode === "1" || largeMode === "auto" && enoughMemory) {
    cases.push({ name: "large", dimensions: [1000, 1000, 1] });
  }
  return cases;
}

function createCompactGrdecl(nx: number, ny: number, nz: number): string {
  const cells = nx * ny * nz;
  const coordCount = 6 * (nx + 1) * (ny + 1);
  return `SPECGRID ${nx} ${ny} ${nz} /\nCOORD ${coordCount}*0 /\nZCORN ${cells * 8}*0 /\nACTNUM ${cells}*1 /\nPORO ${cells}*0.2 /`;
}

function createBenchmarkTrajectory() {
  return createExplicitWellTrajectory([
    { measuredDepth: 0, x: 0, y: 0, z: 0 },
    { measuredDepth: 100, x: 100, y: 50, z: 20 },
    { measuredDepth: 200, x: 200, y: 100, z: 40 }
  ], {
    wellId: "benchmark-well",
    wellName: "Benchmark well",
    lengthUnit: "metres",
    datum: "Benchmark datum",
    datumElevation: 0,
    surfaceLocation: [0, 0, 0],
    coordinateReferenceSystem: { kind: "local", name: "Benchmark" }
  });
}

function measure<T>(operation: () => T): { readonly value: T; readonly measurement: StageMeasurement } {
  const started = performance.now();
  const value = operation();
  return { value, measurement: { milliseconds: performance.now() - started, status: "measured" } };
}

async function measureAsync<T>(operation: () => Promise<T>): Promise<{ readonly value: T; readonly measurement: StageMeasurement }> {
  const started = performance.now();
  const value = await operation();
  return { value, measurement: { milliseconds: performance.now() - started, status: "measured" } };
}

function measureVtkDatasetConstruction(renderPlan: ReturnType<typeof createReservoirRenderPlan>): StageMeasurement {
  const started = performance.now();
  const points = vtkPoints.newInstance();
  points.setData(renderPlan.pointCoordinates, 3);
  const polygons = vtkCellArray.newInstance();
  polygons.setData(renderPlan.vtkPolygons);
  const polyData = vtkPolyData.newInstance();
  polyData.setPoints(points);
  polyData.setPolys(polygons);
  const mapper = vtkMapper.newInstance();
  mapper.setInputData(polyData);
  const actor = vtkActor.newInstance();
  actor.setMapper(mapper);
  actor.delete();
  mapper.delete();
  polyData.delete();
  return { milliseconds: performance.now() - started, status: "measured" };
}

function typedArrayBytesOf(value: unknown, buffers = new Set<ArrayBuffer>()): number {
  collectArrayBuffers(value, buffers);
  return [...buffers].reduce((total, buffer) => total + buffer.byteLength, 0);
}

function collectArrayBuffers(value: unknown, buffers: Set<ArrayBuffer>): void {
  if (ArrayBuffer.isView(value)) {
    if (value.buffer instanceof ArrayBuffer) {
      buffers.add(value.buffer);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectArrayBuffers(item, buffers));
    return;
  }
  if (typeof value === "object" && value !== null) {
    Object.values(value).forEach((item) => collectArrayBuffers(item, buffers));
  }
}

function transferableBytes(transfers: readonly Transferable[]): number {
  return transfers.reduce<number>((total, transfer) => total + (transfer instanceof ArrayBuffer ? transfer.byteLength : 0), 0);
}

function evaluateThresholds(stages: Record<string, StageMeasurement>, thresholds: Record<string, number> | undefined): string[] {
  if (!thresholds) {
    return [];
  }
  return Object.entries(thresholds).flatMap(([stage, maximum]) => {
    const measured = stages[stage]?.milliseconds;
    return measured !== null && measured !== undefined && measured > maximum ? [`${stage} ${measured.toFixed(1)} ms exceeds ${maximum} ms`] : [];
  });
}

async function writeReports(results: readonly BenchmarkResult[]): Promise<void> {
  await mkdir(outputDirectory, { recursive: true });
  const report = {
    generatedAt: new Date().toISOString(),
    environment: { node: process.version, platform: process.platform, arch: process.arch },
    results,
    notes: [
      "Worker transfer measures transferable-buffer preparation and byte counts; browser cross-thread latency is not inferred in Node.",
      "First render and GPU memory are not measured in Node because no reliable WebGL/GPU timing or memory API is available.",
      "Estimated peak memory is the sum of unique typed-array buffers retained by benchmark stages, not process RSS or GPU memory."
    ]
  };
  await writeFile(join(outputDirectory, "reservoir-performance-latest.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(join(outputDirectory, "reservoir-performance-latest.md"), markdownSummary(results), "utf8");
}

function markdownSummary(results: readonly BenchmarkResult[]): string {
  const lines = ["# Reservoir Performance Benchmark", "", "| Case | Cells | Fixture | Parse | Extract | VTK dataset | Property update | Picking | Estimated peak |", "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |"];
  for (const result of results) {
    lines.push(`| ${result.case} | ${result.cells.toLocaleString()} | ${formatStage(result.stages.fixtureGeneration)} | ${formatStage(result.stages.parsing)} | ${formatStage(result.stages.geometryExtraction)} | ${formatStage(result.stages.vtkDatasetConstruction)} | ${formatStage(result.stages.propertyUpdate)} | ${formatStage(result.stages.picking)} | ${formatBytes(result.estimatedPeakBytes)} |`);
  }
  const bottlenecks = results.flatMap((result) => Object.entries(result.stages)
    .filter(([, stage]) => stage.status === "measured" && stage.milliseconds !== null)
    .map(([name, stage]) => ({ label: `${result.case} ${name}`, milliseconds: stage.milliseconds ?? 0 })))
    .sort((first, second) => second.milliseconds - first.milliseconds)
    .slice(0, 3);
  lines.push("", "## Top Bottlenecks", "");
  bottlenecks.forEach((bottleneck, index) => lines.push(`${index + 1}. ${bottleneck.label}: ${bottleneck.milliseconds.toFixed(1)} ms`));
  lines.push("", "## Measurement Notes", "", "- First render is reported separately as not measured in this Node harness; it does not claim a GPU result.", "- Worker transfer reports prepared transferable bytes, not cross-thread latency.", "- Native/WASM work is not recommended by this framework unless repeated reports show a dominant CPU stage exceeding the generous regression threshold.");
  return `${lines.join("\n")}\n`;
}

function formatStage(stage: StageMeasurement | undefined): string {
  return stage?.milliseconds === null || stage?.milliseconds === undefined ? "n/a" : `${stage.milliseconds.toFixed(1)} ms`;
}

function formatBytes(bytes: number): string {
  return `${(bytes / 1024 ** 2).toFixed(1)} MiB`;
}