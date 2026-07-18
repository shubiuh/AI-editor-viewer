import "./style.css";
import "./monaco-workers.js";

import * as monaco from "monaco-editor";
import { initializeDockLayout } from "./dock-layout.js";
import {
  createEditor,
  getLanguageDisplayName,
  getLanguageFromExtension
} from "./editor-config.js";
import {
  codeThemes,
  getStoredTheme,
  registerCodeThemes
} from "./editor-themes.js";
import { createVtkViewer } from "./vtk-viewer.js";
import { ReservoirViewer } from "./reservoir/rendering/reservoir-viewer";
import { defaultWellTrajectoryRenderSettings } from "./reservoir/rendering/trajectory-render-plan";
import { defaultWellLogTrackSettings, SelectedDepthController, supportsDepthMode, WellLogViewer } from "./reservoir/well-log";
import { SurfaceExtractionWorkerClient, SurfaceWorkerCancelledError, SurfaceWorkerInitializationError, SurfaceWorkerRemoteError } from "./reservoir/geometry/surface-worker-client";
import { GrdeclParserWorkerCancelledError, GrdeclParserWorkerClient } from "./reservoir/formats/grdecl/parser-worker-client";
import {
  clearWorkspaceError,
  createReservoirWorkspaceState,
  setWorkspaceClip,
  setWorkspaceError,
  setWorkspaceLoading,
  setWorkspaceProgress,
  setWorkspaceProperty,
  setWorkspaceReady,
  setWorkspaceRepresentation,
  setWorkspaceVisibility
} from "./reservoir/workspace/state";

const openButton = document.querySelector("#open-button");
const saveButton = document.querySelector("#save-button");
const saveAsButton = document.querySelector("#save-as-button");
const themeSelect = document.querySelector("#theme-select");
const cutButton = document.querySelector("#cut-button");
const copyButton = document.querySelector("#copy-button");
const pasteButton = document.querySelector("#paste-button");
const undoButton = document.querySelector("#undo-button");
const redoButton = document.querySelector("#redo-button");
const findButton = document.querySelector("#find-button");
const commandButton = document.querySelector("#command-button");
const openVtkButton = document.querySelector("#open-vtk-button");
const openGlanceButton = document.querySelector("#open-glance-button");
const resetVtkButton = document.querySelector("#reset-vtk-button");
const minimapToggle = document.querySelector("#minimap-toggle");
const wrapSelect = document.querySelector("#wrap-select");
const tabButtons = document.querySelectorAll("[data-ribbon-tab]");
const ribbonPanels = document.querySelectorAll("[data-ribbon-panel]");
const renderTabs = document.querySelectorAll("[data-render-tab]");

const fileNameElement = document.querySelector("#file-name");
const statusMessageElement =
  document.querySelector("#status-message");
const languageNameElement =
  document.querySelector("#language-name");
const vtkFileNameElement = document.querySelector("#vtk-file-name");
const vtkEmptyState = document.querySelector("#vtk-empty-state");
const vtkContent = document.querySelector(".vtk-content");
const glanceRenderWindow = document.querySelector("#glance-render-window");
const editorDock = document.querySelector("#editor-dock");
const vtkDock = document.querySelector("#vtk-dock");
const reservoirDock = document.querySelector("#reservoir-dock");
const reservoirRenderWindow = document.querySelector("#reservoir-render-window");
const reservoirStatus = document.querySelector("#reservoir-status");
const reservoirSummary = document.querySelector("#reservoir-summary");
const reservoirLoadButton = document.querySelector("#reservoir-load-button");
const reservoirCancelButton = document.querySelector("#reservoir-cancel-button");
const reservoirPropertySelect = document.querySelector("#reservoir-property-select");
const reservoirActiveToggle = document.querySelector("#reservoir-active-toggle");
const reservoirInactiveToggle = document.querySelector("#reservoir-inactive-toggle");
const reservoirEdgesToggle = document.querySelector("#reservoir-edges-toggle");
const reservoirCameraSelect = document.querySelector("#reservoir-camera-select");
const reservoirWellControls = document.querySelector("#reservoir-well-controls");
const reservoirLogViewport = document.querySelector("#reservoir-log-viewport");
const reservoirLogControls = document.querySelector("#reservoir-log-controls");
const reservoirLogDepthMode = document.querySelector("#reservoir-log-depth-mode");
const reservoirInspector = document.querySelector("#reservoir-inspector");
const reservoirProgressPanel = document.querySelector("#reservoir-progress-panel");
const reservoirProgress = document.querySelector("#reservoir-progress");
const reservoirProgressText = document.querySelector("#reservoir-progress-text");
const reservoirErrorPanel = document.querySelector("#reservoir-error-panel");
const reservoirErrorText = document.querySelector("#reservoir-error-text");
const reservoirErrorClearButton = document.querySelector("#reservoir-error-clear-button");
const reservoirWarnings = document.querySelector("#reservoir-warnings");
const reservoirClipInputs = [
  document.querySelector("#reservoir-i-min"), document.querySelector("#reservoir-i-max"),
  document.querySelector("#reservoir-j-min"), document.querySelector("#reservoir-j-max"),
  document.querySelector("#reservoir-k-min"), document.querySelector("#reservoir-k-max")
];

let currentFilePath = null;
let currentFileName = "Untitled";
let currentLanguage = "plaintext";
let savedContent = "";
let isDirty = false;
const themeStorageKey = "my-code-editor.theme";
registerCodeThemes();
const supportedThemes = new Set(Object.keys(codeThemes));
const currentTheme = getStoredTheme(themeStorageKey);
const editor = createEditor(
  document.querySelector("#editor"),
  currentTheme
);
const vtkViewer = createVtkViewer(
  document.querySelector("#vtk-render-window")
);
const reservoirViewer = new ReservoirViewer();
const selectedDepthController = new SelectedDepthController();
const reservoirLogViewer = new WellLogViewer(reservoirLogViewport, {
  onSelectedDepth: (event) => selectedDepthController.set(event)
});
const surfaceWorkerClient = new SurfaceExtractionWorkerClient();
const grdeclParserWorkerClient = new GrdeclParserWorkerClient();
let reservoirWorkspaceState = createReservoirWorkspaceState();
let reservoirModel = null;
let reservoirTask = null;
let reservoirParseTask = null;
let activeReservoirToken = null;
let reservoirLoadGeneration = 0;
let reservoirStage = "Ready";
let reservoirAttached = false;
const wellRenderSettings = new Map();
const wellPalette = [[0.94, 0.37, 0.16], [0.13, 0.77, 0.72], [0.96, 0.76, 0.2], [0.58, 0.72, 0.96]];
const logRenderSettings = new Map();
const logPalette = [[0.94, 0.37, 0.16], [0.18, 0.82, 0.71], [0.96, 0.76, 0.2], [0.58, 0.72, 0.96]];
let reservoirLogPlotCurves = [];
selectedDepthController.subscribe((event) => {
  reservoirLogViewer.setSelectedDepth(event);
  if (event.source === "well-log") {
    reservoirInspector.textContent = `Selected ${event.depthMode.toUpperCase()} ${event.depth.toFixed(2)} m from well-log viewer.`;
  }
});
initializeDockLayout();
new ResizeObserver(() => vtkViewer.resize()).observe(
  document.querySelector("#vtk-render-window")
);

savedContent = editor.getValue();
currentLanguage = "javascript";
themeSelect.value = currentTheme;
updateWindowState();

function setStatus(message) {
  statusMessageElement.textContent = message;
}

function changeTheme(theme) {
  if (!supportedThemes.has(theme)) {
    return;
  }

  monaco.editor.setTheme(theme);
  localStorage.setItem(themeStorageKey, theme);
  setStatus(`代码主题已切换：${themeSelect.options[themeSelect.selectedIndex].text}`);
}

function runEditorCommand(command) {
  editor.trigger("ribbon", command, null);
  editor.focus();
}

function selectRibbonTab(tabName) {
  tabButtons.forEach((button) => {
    const isActive = button.dataset.ribbonTab === tabName;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  });

  ribbonPanels.forEach((panel) => {
    panel.classList.toggle(
      "active",
      panel.dataset.ribbonPanel === tabName
    );
  });
}

tabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    selectRibbonTab(button.dataset.ribbonTab);
  });
});
selectRibbonTab("home");

function selectRenderTab(tabName) {
  const isEditor = tabName === "editor";
  const isVtk = tabName === "vtk";
  const isGlance = tabName === "glance";
  const isReservoir = tabName === "reservoir";

  renderTabs.forEach((tab) => {
    const isActive = tab.dataset.renderTab === tabName;
    tab.classList.toggle("active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
  });

  editorDock.classList.toggle("is-render-active", isEditor);
  vtkDock.classList.toggle("is-render-active", isVtk || isGlance);
  reservoirDock.classList.toggle("is-render-active", isReservoir);
  vtkContent.classList.toggle("is-glance-active", isGlance);

  if (isGlance && !glanceRenderWindow.src) {
    glanceRenderWindow.src = "/glance/index.html";
  }

  requestAnimationFrame(() => {
    if (isEditor) {
      editor.layout();
    }

    if (isVtk) {
      vtkViewer.resize();
      vtkViewer.resetCamera();
    }

    if (isReservoir) {
      ensureReservoirViewer();
      reservoirViewer.resize();
    }
  });
}

renderTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    selectRenderTab(tab.dataset.renderTab);
  });
  tab.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      return;
    }
    event.preventDefault();
    const tabs = [...renderTabs];
    const currentIndex = tabs.indexOf(tab);
    const nextIndex = event.key === "Home" ? 0
      : event.key === "End" ? tabs.length - 1
        : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    const nextTab = tabs[nextIndex];
    nextTab.focus();
    selectRenderTab(nextTab.dataset.renderTab);
  });
});

function ensureReservoirViewer() {
  if (!reservoirAttached) {
    reservoirViewer.attach(reservoirRenderWindow);
    reservoirAttached = true;
  }
}

function updateReservoirUI() {
  const state = reservoirWorkspaceState;
  reservoirStatus.textContent = state.status === "loading" ? reservoirStage : state.status;
  reservoirCancelButton.disabled = state.status !== "loading";
  reservoirProgressPanel.hidden = state.status !== "loading";
  reservoirProgress.value = state.progress;
  reservoirProgressText.textContent = `${Math.round(state.progress * 100)}%`;
  reservoirErrorPanel.hidden = !state.error;
  reservoirErrorText.textContent = state.error ?? "";
  reservoirWarnings.hidden = !reservoirModel?.warnings.length;
  reservoirWarnings.textContent = reservoirModel?.warnings.map((warning) => `${warning.keyword} at ${warning.location.line}:${warning.location.column}: ${warning.message}`).join("\n") ?? "";
  if (!reservoirModel || !reservoirSummary) {
    return;
  }
  const { dimensions, surface, warnings, parsingDurationMs, geometryDurationMs } = reservoirModel;
  reservoirSummary.innerHTML = `
    <div><dt>Grid</dt><dd>${dimensions.nx} x ${dimensions.ny} x ${dimensions.nz}</dd></div>
    <div><dt>Cells</dt><dd>${dimensions.totalCellCount}</dd></div>
    <div><dt>Active</dt><dd>${surface.statistics.activeCellCount}</dd></div>
    <div><dt>Faces</dt><dd>${surface.statistics.emittedFaceCount}</dd></div>
    <div><dt>Bounds</dt><dd>${formatBounds(surface.modelBounds)}</dd></div>
    <div><dt>Parsing</dt><dd>${formatDuration(parsingDurationMs)}</dd></div>
    <div><dt>Geometry</dt><dd>${formatDuration(geometryDurationMs)}</dd></div>
    <div><dt>Properties</dt><dd>${reservoirModel.properties.map((property) => property.descriptor.keyword).join(", ") || "None"}</dd></div>
    <div><dt>Warnings</dt><dd>${warnings.length}</dd></div>`;
}

async function loadGrdeclReservoir() {
  cancelReservoirLoad();
  const generation = ++reservoirLoadGeneration;
  const reservoirFiles = window.electronAPI?.reservoirFiles;
  if (!reservoirFiles) {
    reservoirWorkspaceState = setWorkspaceError(reservoirWorkspaceState, "File access is only available in the Electron application.");
    updateReservoirUI();
    return;
  }
  ensureReservoirViewer();
  reservoirViewer.clear();
  reservoirModel = null;
  wellRenderSettings.clear();
  logRenderSettings.clear();
  reservoirLogPlotCurves = [];
  reservoirLogViewer.setCurves([]);
  updateReservoirWellControls();
  updateReservoirLogControls();
  replaceReservoirPropertyOptions([]);
  reservoirStage = "Selecting GRDECL file";
  reservoirWorkspaceState = setWorkspaceLoading(reservoirWorkspaceState);
  updateReservoirUI();
  let token;
  try {
    const opened = await reservoirFiles.open();
    if (!isCurrentReservoirLoad(generation)) {
      return;
    }
    if (opened.canceled) {
      reservoirWorkspaceState = { ...reservoirWorkspaceState, status: "idle", progress: 0 };
      reservoirStage = "Ready";
      updateReservoirUI();
      return;
    }
    if (!opened.metadata) {
      throw new Error(opened.error?.message || "The selected reservoir file could not be opened.");
    }
    const metadata = opened.metadata;
    token = metadata.token;
    activeReservoirToken = token;
    if (!isSupportedGrdeclExtension(metadata.extension)) {
      throw new Error(`Unsupported reservoir file type: ${metadata.extension || "no extension"}. Select an ASCII .grdecl, .grid, or .data file.`);
    }
    const parsingStarted = performance.now();
    reservoirStage = "Parsing GRDECL";
    reservoirParseTask = grdeclParserWorkerClient.start((fraction) => {
      if (isCurrentReservoirLoad(generation)) {
        reservoirWorkspaceState = setWorkspaceProgress(reservoirWorkspaceState, fraction * 0.5);
        updateReservoirUI();
      }
    });
    await streamReservoirFile(reservoirFiles, metadata, reservoirParseTask, generation);
    const parsed = await reservoirParseTask.finish();
    reservoirParseTask = null;
    if (!isCurrentReservoirLoad(generation)) {
      return;
    }
    const parsingDurationMs = performance.now() - parsingStarted;
    const grid = parsed.reservoirCase.grids[0];
    if (!grid || grid.kind !== "corner-point") {
      throw new Error("Parser did not produce a corner-point grid.");
    }
    const activityMask = grid.geometry.activityMask?.slice();
    const geometryStarted = performance.now();
    reservoirStage = "Extracting visible faces";
    reservoirWorkspaceState = setWorkspaceProgress(reservoirWorkspaceState, 0.5);
    updateReservoirUI();
    reservoirTask = surfaceWorkerClient.extract(
      { kind: "corner-point", geometry: grid.geometry },
      { progressIntervalCells: 8_192 },
      (progress) => {
        if (isCurrentReservoirLoad(generation)) {
          reservoirWorkspaceState = setWorkspaceProgress(reservoirWorkspaceState, 0.5 + progress.fraction * 0.5);
          updateReservoirUI();
        }
      }
    );
    const surface = await reservoirTask.result;
    reservoirTask = null;
    if (!isCurrentReservoirLoad(generation)) {
      return;
    }
    reservoirModel = {
      dimensions: grid.geometry.dimensions,
      activityMask,
      localOrigin: parsed.reservoirCase.metadata.localOrigin,
      properties: parsed.reservoirCase.propertyCatalog.map((descriptor) => ({ descriptor, frame: parsed.reservoirCase.propertyFrames.find((frame) => frame.propertyId === descriptor.id) })),
      wells: parsed.reservoirCase.wells,
      wellLogCurves: parsed.reservoirCase.wellLogCurves,
      surface,
      warnings: parsed.warnings,
      parsingDurationMs,
      geometryDurationMs: performance.now() - geometryStarted
    };
    reservoirViewer.setGeometry({ surface, dimensions: reservoirModel.dimensions, localOrigin: reservoirModel.localOrigin, ...(activityMask ? { activityMask } : {}) });
    updateReservoirWellControls();
    applyReservoirWells();
    initializeReservoirLogs();
    replaceReservoirPropertyOptions(reservoirModel.properties);
    reservoirWorkspaceState = setWorkspaceProperty(reservoirWorkspaceState, reservoirModel.properties[0]?.descriptor.id);
    applyReservoirWorkspaceState();
    reservoirWorkspaceState = setWorkspaceReady(reservoirWorkspaceState);
    reservoirStage = "Ready";
    updateReservoirUI();
    setStatus(`Loaded reservoir grid: ${metadata.fileName}`);
  } catch (error) {
    if (!isCurrentReservoirLoad(generation)) {
      return;
    }
    reservoirParseTask = null;
    reservoirTask = null;
    reservoirWorkspaceState = error instanceof GrdeclParserWorkerCancelledError || error instanceof SurfaceWorkerCancelledError
      ? { ...reservoirWorkspaceState, status: "cancelled", progress: 0 }
      : setWorkspaceError(reservoirWorkspaceState, formatReservoirError(error));
    reservoirStage = "Import stopped";
    updateReservoirUI();
  } finally {
    if (token) {
      await reservoirFiles.release(token);
      if (activeReservoirToken === token) {
        activeReservoirToken = null;
      }
    }
  }
}

function applyReservoirWorkspaceState() {
  if (!reservoirModel?.surface) {
    return;
  }
  reservoirViewer.setVisibility(reservoirWorkspaceState.visibility);
  reservoirViewer.setIJKClip(reservoirWorkspaceState.clip);
  reservoirViewer.setRepresentation(reservoirWorkspaceState.representation);
  const property = reservoirModel.properties.find((candidate) => candidate.descriptor.id === reservoirWorkspaceState.selectedPropertyId);
  reservoirViewer.setProperty(property?.frame ? {
    values: property.frame.values,
    ...(property.frame.validityMask ? { validityMask: property.frame.validityMask } : {}),
    ...(property.descriptor.range ? { range: property.descriptor.range } : {}),
    undefinedVisible: true
  } : undefined);
}

function applyReservoirWells() {
  if (!reservoirModel) {
    reservoirViewer.setWells([]);
    return;
  }
  reservoirViewer.setWells(reservoirModel.wells.map((trajectory, index) => ({
    trajectory,
    settings: wellSettingsFor(trajectory, index)
  })));
}

function initializeReservoirLogs() {
  reservoirLogPlotCurves = (reservoirModel?.wellLogCurves ?? []).map((curve, index) => ({ curve, color: logPalette[index % logPalette.length] }));
  logRenderSettings.clear();
  reservoirLogViewer.setCurves(reservoirLogPlotCurves);
  reservoirLogDepthMode.value = "md";
  reservoirLogDepthMode.disabled = !supportsDepthMode(reservoirLogPlotCurves, "tvd");
  updateReservoirLogControls();
}

function applyReservoirLogs() {
  reservoirLogViewer.setTrackSettings(reservoirLogPlotCurves.map((curve, index) => logSettingsFor(curve, index)));
}

function updateReservoirLogControls() {
  reservoirLogControls.replaceChildren();
  if (reservoirLogPlotCurves.length === 0) {
    reservoirLogControls.textContent = "No log curves loaded.";
    return;
  }
  reservoirLogPlotCurves.forEach((plotCurve, index) => {
    const settings = logSettingsFor(plotCurve, index);
    const control = document.createElement("div");
    control.className = "reservoir-well-control";
    const title = document.createElement("strong");
    title.textContent = `${plotCurve.curve.mnemonic} (${plotCurve.curve.unit.symbol})`;
    control.append(title);
    control.append(
      wellCheckbox("Visible", settings.visible, (visible) => updateLogSettings(settings.curveId, { visible })),
      wellSelect("Scale", [["linear", "Linear"], ["logarithmic", "Log"]], settings.scale, (scale) => updateLogSettings(settings.curveId, { scale })),
      wellNumber("Minimum", settings.range.minimum, settings.scale === "logarithmic" ? Number.MIN_VALUE : -Number.MAX_VALUE, (minimum) => updateLogRange(settings.curveId, { ...settings.range, minimum })),
      wellNumber("Maximum", settings.range.maximum, -Number.MAX_VALUE, (maximum) => updateLogRange(settings.curveId, { ...settings.range, maximum }))
    );
    reservoirLogControls.append(control);
  });
}

function logSettingsFor(plotCurve, index) {
  const key = `${plotCurve.curve.wellId}:${plotCurve.curve.mnemonic}`;
  const stored = logRenderSettings.get(key);
  if (stored) {
    return stored;
  }
  const settings = defaultWellLogTrackSettings(plotCurve);
  logRenderSettings.set(key, settings);
  return settings;
}

function updateLogSettings(curveId, patch) {
  const current = logRenderSettings.get(curveId);
  if (!current) {
    return;
  }
  const next = { ...current, ...patch };
  if (next.scale === "logarithmic" && next.range.minimum <= 0) {
    next.range = { ...next.range, minimum: Math.max(Number.MIN_VALUE, next.range.maximum / 1000) };
  }
  logRenderSettings.set(curveId, next);
  applyReservoirLogs();
  updateReservoirLogControls();
}

function updateLogRange(curveId, range) {
  if (!Number.isFinite(range.minimum) || !Number.isFinite(range.maximum) || range.maximum <= range.minimum) {
    return;
  }
  updateLogSettings(curveId, { range });
}

function updateReservoirWellControls() {
  reservoirWellControls.replaceChildren();
  const wells = reservoirModel?.wells ?? [];
  if (wells.length === 0) {
    reservoirWellControls.textContent = "No trajectories loaded.";
    return;
  }
  wells.forEach((trajectory, index) => {
    const settings = wellSettingsFor(trajectory, index);
    const control = document.createElement("div");
    control.className = "reservoir-well-control";
    const name = document.createElement("strong");
    name.textContent = trajectory.wellName;
    control.append(name);
    control.append(
      wellCheckbox("Visible", settings.visible, (checked) => updateWellSettings(trajectory.wellId, { visible: checked })),
      wellColor(settings.color, (color) => updateWellSettings(trajectory.wellId, { color })),
      wellSelect("Representation", [["line", "Line"], ["tube", "Tube"]], settings.representation, (representation) => updateWellSettings(trajectory.wellId, { representation })),
      wellNumber("Radius", settings.radius, 0.01, (radius) => updateWellSettings(trajectory.wellId, { radius })),
      wellCheckbox("Name label", settings.showLabel, (showLabel) => updateWellSettings(trajectory.wellId, { showLabel })),
      wellCheckbox("MD tick marks", settings.showMdTicks, (showMdTicks) => updateWellSettings(trajectory.wellId, { showMdTicks })),
      wellNumber("Tick interval", settings.mdTickInterval, 1, (mdTickInterval) => updateWellSettings(trajectory.wellId, { mdTickInterval })),
      wellCheckbox("Clip to reservoir", settings.clipToReservoirBounds, (clipToReservoirBounds) => updateWellSettings(trajectory.wellId, { clipToReservoirBounds }))
    );
    reservoirWellControls.append(control);
  });
}

function wellSettingsFor(trajectory, index) {
  const stored = wellRenderSettings.get(trajectory.wellId);
  if (stored) {
    return stored;
  }
  const settings = defaultWellTrajectoryRenderSettings(trajectory.wellId, wellPalette[index % wellPalette.length]);
  wellRenderSettings.set(trajectory.wellId, settings);
  return settings;
}

function updateWellSettings(wellId, patch) {
  const current = wellRenderSettings.get(wellId);
  if (!current) {
    return;
  }
  const next = { ...current, ...patch };
  wellRenderSettings.set(wellId, next);
  applyReservoirWells();
}

function wellCheckbox(label, checked, onChange) {
  const control = document.createElement("label");
  control.className = "reservoir-checkbox";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = checked;
  input.addEventListener("change", () => onChange(input.checked));
  control.append(input, document.createTextNode(label));
  return control;
}

function wellNumber(label, value, minimum, onChange) {
  const control = document.createElement("label");
  control.append(document.createTextNode(label));
  const input = document.createElement("input");
  input.type = "number";
  input.min = String(minimum);
  input.step = "any";
  input.value = String(value);
  input.addEventListener("change", () => {
    const next = Number(input.value);
    if (Number.isFinite(next) && next >= minimum) {
      onChange(next);
    }
  });
  control.append(input);
  return control;
}

function wellSelect(label, options, value, onChange) {
  const control = document.createElement("label");
  control.append(document.createTextNode(label));
  const select = document.createElement("select");
  options.forEach(([optionValue, optionLabel]) => select.add(new Option(optionLabel, optionValue)));
  select.value = value;
  select.addEventListener("change", () => onChange(select.value));
  control.append(select);
  return control;
}

function wellColor(color, onChange) {
  const control = document.createElement("label");
  control.append(document.createTextNode("Color"));
  const input = document.createElement("input");
  input.type = "color";
  input.value = rgbToHex(color);
  input.addEventListener("input", () => onChange(hexToRgb(input.value)));
  control.append(input);
  return control;
}

function rgbToHex(color) {
  return `#${color.map((component) => Math.round(component * 255).toString(16).padStart(2, "0")).join("")}`;
}

function hexToRgb(value) {
  return [
    Number.parseInt(value.slice(1, 3), 16) / 255,
    Number.parseInt(value.slice(3, 5), 16) / 255,
    Number.parseInt(value.slice(5, 7), 16) / 255
  ];
}

async function streamReservoirFile(reservoirFiles, metadata, parserTask, generation) {
  const chunkSize = 1024 * 1024;
  for (let offset = 0; offset < metadata.size; offset += chunkSize) {
    if (!isCurrentReservoirLoad(generation)) {
      throw new GrdeclParserWorkerCancelledError();
    }
    const length = Math.min(chunkSize, metadata.size - offset);
    const read = await reservoirFiles.readRange(metadata.token, offset, length);
    if (!read.ok) {
      throw new Error(`File read error: ${read.error.message}`);
    }
    await parserTask.write(read.data, offset + length, metadata.size);
  }
}

function cancelReservoirLoad() {
  if (reservoirWorkspaceState.status !== "loading") {
    return;
  }
  reservoirLoadGeneration += 1;
  grdeclParserWorkerClient.cancel();
  if (reservoirTask) {
    surfaceWorkerClient.cancel(reservoirTask.requestId);
  }
  if (activeReservoirToken) {
    window.electronAPI?.reservoirFiles?.release(activeReservoirToken);
    activeReservoirToken = null;
  }
  reservoirWorkspaceState = { ...reservoirWorkspaceState, status: "cancelled", progress: 0 };
  reservoirStage = "Cancelled";
  updateReservoirUI();
}

function replaceReservoirPropertyOptions(properties) {
  reservoirPropertySelect.replaceChildren(new Option("None", "none"));
  for (const { descriptor } of properties) {
    reservoirPropertySelect.add(new Option(descriptor.displayName, descriptor.id));
  }
}

function isCurrentReservoirLoad(generation) {
  return generation === reservoirLoadGeneration;
}

function isSupportedGrdeclExtension(extension) {
  return [".grdecl", ".grid", ".data"].includes(extension.toLowerCase());
}

function formatReservoirError(error) {
  const message = error instanceof Error ? error.message : "Unknown reservoir import failure.";
  if (error?.name === "GrdeclParserWorkerRemoteError") {
    const location = error.location ? ` at ${error.location.line}:${error.location.column}` : "";
    return `Parsing error${location}: ${message}`;
  }
  if (error instanceof SurfaceWorkerRemoteError || error instanceof SurfaceWorkerInitializationError) {
    return `Geometry error: ${message}`;
  }
  return `File/import error: ${message}`;
}

function formatDuration(durationMs) {
  return `${Math.round(durationMs)} ms`;
}

function formatBounds(bounds) {
  return `X ${bounds[0].toFixed(2)}..${bounds[1].toFixed(2)}, Y ${bounds[2].toFixed(2)}..${bounds[3].toFixed(2)}, Z ${bounds[4].toFixed(2)}..${bounds[5].toFixed(2)}`;
}

function readClip() {
  const values = reservoirClipInputs.map((input) => Number(input.value));
  return { i: [values[0], values[1]], j: [values[2], values[3]], k: [values[4], values[5]] };
}

reservoirLoadButton.addEventListener("click", loadGrdeclReservoir);
reservoirCancelButton.addEventListener("click", cancelReservoirLoad);
reservoirPropertySelect.addEventListener("change", () => {
  reservoirWorkspaceState = setWorkspaceProperty(reservoirWorkspaceState, reservoirPropertySelect.value === "none" ? undefined : reservoirPropertySelect.value);
  applyReservoirWorkspaceState();
});
reservoirActiveToggle.addEventListener("change", () => {
  reservoirWorkspaceState = setWorkspaceVisibility(reservoirWorkspaceState, { ...reservoirWorkspaceState.visibility, active: reservoirActiveToggle.checked });
  applyReservoirWorkspaceState();
});
reservoirInactiveToggle.addEventListener("change", () => {
  reservoirWorkspaceState = setWorkspaceVisibility(reservoirWorkspaceState, { ...reservoirWorkspaceState.visibility, inactiveNeighborBoundary: reservoirInactiveToggle.checked });
  applyReservoirWorkspaceState();
});
reservoirEdgesToggle.addEventListener("change", () => {
  reservoirWorkspaceState = setWorkspaceRepresentation(reservoirWorkspaceState, reservoirEdgesToggle.checked ? "surface-with-edges" : "surface");
  applyReservoirWorkspaceState();
});
reservoirClipInputs.forEach((input) => input.addEventListener("change", () => {
  reservoirWorkspaceState = setWorkspaceClip(reservoirWorkspaceState, readClip());
  applyReservoirWorkspaceState();
}));
reservoirCameraSelect.addEventListener("change", () => reservoirViewer.setGeologicalView(reservoirCameraSelect.value));
reservoirLogDepthMode.addEventListener("change", () => reservoirLogViewer.setDepthMode(reservoirLogDepthMode.value));
reservoirErrorClearButton.addEventListener("click", () => {
  reservoirWorkspaceState = clearWorkspaceError(reservoirWorkspaceState);
  updateReservoirUI();
});
reservoirRenderWindow.addEventListener("click", (event) => {
  const bounds = reservoirRenderWindow.getBoundingClientRect();
  const picked = reservoirViewer.pick(event.clientX - bounds.left, event.clientY - bounds.top);
  if (picked && "wellId" in picked) {
    reservoirInspector.textContent = `Well ${picked.wellName} | MD ${picked.measuredDepth.toFixed(2)} m | Station ${picked.stationIndex} | XYZ ${picked.worldCoordinate.map((value) => value.toFixed(2)).join(", ")}`;
    selectedDepthController.set({ source: "reservoir", depthMode: "md", depth: picked.measuredDepth });
    return;
  }
  reservoirInspector.textContent = picked
    ? `Cell ${String(picked.originalCellId)} | IJK ${picked.ijk.join(", ")} | Value ${picked.propertyValue ?? "undefined"}`
    : "No cell selected.";
});
window.addEventListener("beforeunload", () => {
  cancelReservoirLoad();
  grdeclParserWorkerClient.terminate();
  surfaceWorkerClient.terminate();
  reservoirLogViewer.dispose();
  reservoirViewer.dispose();
}, { once: true });

function decodeBase64(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes.buffer;
}

function renderLegacyVtkData(data, fileName) {
  vtkViewer.renderData(data, ".vtk");
  selectRenderTab("vtk");
  vtkFileNameElement.textContent = fileName;
  vtkEmptyState.hidden = true;
  setStatus(`已加载 VTK：${fileName}`);
}

function openFileInBrowser() {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".js,.jsx,.ts,.tsx,.json,.html,.css,.scss,.less,.md,.py,.java,.c,.cpp,.h,.hpp,.xml,.yaml,.yml,.sh,.sql,.txt";

    input.addEventListener("change", async () => {
      const file = input.files?.[0];

      if (!file) {
        resolve({ canceled: true });
        return;
      }

      const extension = `.${file.name.split(".").pop().toLowerCase()}`;
      resolve({
        canceled: false,
        fileName: file.name,
        extension,
        content: await file.text()
      });
    }, { once: true });

    input.click();
  });
}

async function openVtkFile() {
  try {
    setStatus("正在打开 VTK 数据……");
    const result = await window.electronAPI.openVtkFile();

    if (result.canceled) {
      setStatus("已取消打开 VTK 文件");
      return;
    }

    if (result.error) {
      throw new Error(result.error);
    }

    renderLegacyVtkData(decodeBase64(result.content), result.fileName);
  } catch (error) {
    console.error(error);
    const message = `加载 VTK 失败：${error.message}`;
    setStatus(message);
    alert(message);
  }
}

function openGlance() {
  selectRenderTab("glance");
  vtkFileNameElement.textContent = "Kitware Glance";
  setStatus("已打开 Kitware Glance：可在其界面中选择支持的文件");
}

function updateWindowState() {
  const dirtyMark = isDirty ? "● " : "";

  fileNameElement.textContent =
    `${dirtyMark}${currentFileName}`;

  languageNameElement.textContent =
    getLanguageDisplayName(currentLanguage);

  document.title =
    `${dirtyMark}${currentFileName} — My Code Editor`;
}

function updateDirtyState() {
  isDirty = editor.getValue() !== savedContent;
  updateWindowState();
}

function replaceEditorContent(content, language) {
  const oldModel = editor.getModel();

  const newModel = monaco.editor.createModel(
    content,
    language
  );

  editor.setModel(newModel);

  if (oldModel) {
    oldModel.dispose();
  }

  editor.setPosition({
    lineNumber: 1,
    column: 1
  });

  editor.focus();
}

async function openFile() {
  try {
    setStatus("正在打开文件……");

    const result = window.electronAPI
      ? await window.electronAPI.openFile()
      : await openFileInBrowser();

    if (result.canceled) {
      setStatus("已取消打开");
      return;
    }

    if (result.error) {
      setStatus(result.error);
      alert(result.error);
      return;
    }

    currentFilePath = result.filePath;
    currentFileName = result.fileName;
    currentLanguage =
      getLanguageFromExtension(result.extension);

    replaceEditorContent(
      result.content,
      currentLanguage
    );

    savedContent = result.content;
    isDirty = false;

    updateWindowState();
    setStatus(`已打开：${result.filePath}`);
  } catch (error) {
    console.error(error);

    const message = `打开文件失败：${error.message}`;

    setStatus(message);
    alert(message);
  }
}

async function saveFile() {
  if (!currentFilePath) {
    return saveFileAs();
  }

  try {
    setStatus("正在保存……");

    const content = editor.getValue();

    const result = await window.electronAPI.saveFile(
      currentFilePath,
      content
    );

    if (!result.success) {
      setStatus(result.error);
      alert(result.error);
      return;
    }

    savedContent = content;
    isDirty = false;

    updateWindowState();
    setStatus(`已保存：${currentFilePath}`);
  } catch (error) {
    console.error(error);

    const message = `保存失败：${error.message}`;

    setStatus(message);
    alert(message);
  }
}

async function saveFileAs() {
  try {
    setStatus("请选择保存位置……");

    const content = editor.getValue();

    const result =
      await window.electronAPI.saveFileAs(
        currentFilePath,
        content
      );

    if (result.canceled) {
      setStatus("已取消保存");
      return;
    }

    if (!result.success) {
      setStatus(result.error);
      alert(result.error);
      return;
    }

    currentFilePath = result.filePath;
    currentFileName = result.fileName;
    currentLanguage =
      getLanguageFromExtension(result.extension);

    monaco.editor.setModelLanguage(
      editor.getModel(),
      currentLanguage
    );

    savedContent = content;
    isDirty = false;

    updateWindowState();
    setStatus(`已保存：${currentFilePath}`);
  } catch (error) {
    console.error(error);

    const message = `另存为失败：${error.message}`;

    setStatus(message);
    alert(message);
  }
}

openButton.addEventListener("click", openFile);
saveButton.addEventListener("click", saveFile);
saveAsButton.addEventListener("click", saveFileAs);
themeSelect.addEventListener("change", (event) => {
  changeTheme(event.target.value);
});
cutButton.addEventListener("click", () => runEditorCommand("editor.action.clipboardCutAction"));
copyButton.addEventListener("click", () => runEditorCommand("editor.action.clipboardCopyAction"));
pasteButton.addEventListener("click", () => runEditorCommand("editor.action.clipboardPasteAction"));
undoButton.addEventListener("click", () => runEditorCommand("undo"));
redoButton.addEventListener("click", () => runEditorCommand("redo"));
findButton.addEventListener("click", () => runEditorCommand("actions.find"));
commandButton.addEventListener("click", () => runEditorCommand("editor.action.quickCommand"));
openVtkButton.addEventListener("click", openVtkFile);
openGlanceButton.addEventListener("click", openGlance);
resetVtkButton.addEventListener("click", () => {
  vtkViewer.resetCamera();
  setStatus("已重置 VTK 3D 相机");
});
minimapToggle.addEventListener("change", (event) => {
  editor.updateOptions({
    minimap: { enabled: event.target.checked }
  });
});
wrapSelect.addEventListener("change", (event) => {
  editor.updateOptions({ wordWrap: event.target.value });
});
editor.onDidChangeModelContent(() => {
  updateDirtyState();
});

/**
 * Ctrl+O / Command+O
 */
editor.addCommand(
  monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyO,
  () => {
    openFile();
  }
);

/**
 * Ctrl+S / Command+S
 */
editor.addCommand(
  monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
  () => {
    saveFile();
  }
);

/**
 * Ctrl+Shift+S / Command+Shift+S
 */
editor.addCommand(
  monaco.KeyMod.CtrlCmd |
    monaco.KeyMod.Shift |
    monaco.KeyCode.KeyS,
  () => {
    saveFileAs();
  }
);