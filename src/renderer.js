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
import { SurfaceExtractionWorkerClient, SurfaceWorkerCancelledError } from "./reservoir/geometry/surface-worker-client";
import { createThreeByTwoByTwoPropertyFixture } from "./reservoir/testing/fixtures";
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
const reservoirInspector = document.querySelector("#reservoir-inspector");
const reservoirProgressPanel = document.querySelector("#reservoir-progress-panel");
const reservoirProgress = document.querySelector("#reservoir-progress");
const reservoirProgressText = document.querySelector("#reservoir-progress-text");
const reservoirErrorPanel = document.querySelector("#reservoir-error-panel");
const reservoirErrorText = document.querySelector("#reservoir-error-text");
const reservoirErrorClearButton = document.querySelector("#reservoir-error-clear-button");
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
const surfaceWorkerClient = new SurfaceExtractionWorkerClient();
let reservoirWorkspaceState = createReservoirWorkspaceState();
let reservoirFixture = null;
let reservoirTask = null;
let reservoirAttached = false;
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
      if (reservoirWorkspaceState.status === "idle") {
        loadSyntheticReservoir();
      }
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
  reservoirStatus.textContent = state.status === "loading" ? "Extracting surface" : state.status;
  reservoirCancelButton.disabled = state.status !== "loading";
  reservoirProgressPanel.hidden = state.status !== "loading";
  reservoirProgress.value = state.progress;
  reservoirProgressText.textContent = `${Math.round(state.progress * 100)}%`;
  reservoirErrorPanel.hidden = !state.error;
  reservoirErrorText.textContent = state.error ?? "";
  if (!reservoirFixture || !reservoirSummary) {
    return;
  }
  const cells = reservoirFixture.expected.totalCellCount;
  const active = reservoirFixture.expected.activeCellCount;
  const faces = reservoirFixture.surface?.statistics.emittedFaceCount ?? "-";
  reservoirSummary.innerHTML = `
    <div><dt>Grid</dt><dd>${reservoirFixture.expected.dimensions.nx} x ${reservoirFixture.expected.dimensions.ny} x ${reservoirFixture.expected.dimensions.nz}</dd></div>
    <div><dt>Cells</dt><dd>${cells}</dd></div>
    <div><dt>Active</dt><dd>${active}</dd></div>
    <div><dt>Faces</dt><dd>${faces}</dd></div>`;
}

function loadSyntheticReservoir() {
  if (reservoirWorkspaceState.status === "loading") {
    return;
  }
  ensureReservoirViewer();
  reservoirFixture = createThreeByTwoByTwoPropertyFixture();
  if (reservoirFixture.grid.kind !== "corner-point") {
    return;
  }
  reservoirWorkspaceState = setWorkspaceLoading(reservoirWorkspaceState);
  updateReservoirUI();
  reservoirTask = surfaceWorkerClient.extract(
    { kind: "corner-point", geometry: reservoirFixture.grid.geometry },
    { progressIntervalCells: 1 },
    (progress) => {
      reservoirWorkspaceState = setWorkspaceProgress(reservoirWorkspaceState, progress.fraction);
      updateReservoirUI();
    }
  );
  reservoirTask.result.then((surface) => {
    if (!reservoirFixture) {
      return;
    }
    reservoirFixture.surface = surface;
    reservoirViewer.setGeometry({
      surface,
      dimensions: reservoirFixture.expected.dimensions,
      localOrigin: reservoirFixture.localOrigin,
      ...(reservoirFixture.grid.geometry.activityMask ? { activityMask: reservoirFixture.grid.geometry.activityMask } : {})
    });
    applyReservoirWorkspaceState();
    reservoirWorkspaceState = setWorkspaceReady(reservoirWorkspaceState);
    updateReservoirUI();
    setStatus("Synthetic reservoir loaded");
  }).catch((error) => {
    reservoirWorkspaceState = error instanceof SurfaceWorkerCancelledError
      ? { ...reservoirWorkspaceState, status: "cancelled", progress: 0 }
      : setWorkspaceError(reservoirWorkspaceState, error.message || "Reservoir surface extraction failed.");
    updateReservoirUI();
  }).finally(() => {
    reservoirTask = null;
  });
}

function applyReservoirWorkspaceState() {
  if (!reservoirFixture?.surface) {
    return;
  }
  reservoirViewer.setVisibility(reservoirWorkspaceState.visibility);
  reservoirViewer.setIJKClip(reservoirWorkspaceState.clip);
  reservoirViewer.setRepresentation(reservoirWorkspaceState.representation);
  const property = reservoirWorkspaceState.selectedPropertyId === "synthetic-porosity"
    ? reservoirFixture.property
    : undefined;
  reservoirViewer.setProperty(property ? {
    values: property.frame.values,
    ...(property.frame.validityMask ? { validityMask: property.frame.validityMask } : {}),
    ...(property.descriptor.range ? { range: property.descriptor.range } : {}),
    undefinedVisible: true
  } : undefined);
}

function readClip() {
  const values = reservoirClipInputs.map((input) => Number(input.value));
  return { i: [values[0], values[1]], j: [values[2], values[3]], k: [values[4], values[5]] };
}

reservoirLoadButton.addEventListener("click", loadSyntheticReservoir);
reservoirCancelButton.addEventListener("click", () => {
  if (reservoirTask) {
    surfaceWorkerClient.cancel(reservoirTask.requestId);
  }
});
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
reservoirErrorClearButton.addEventListener("click", () => {
  reservoirWorkspaceState = clearWorkspaceError(reservoirWorkspaceState);
  updateReservoirUI();
});
reservoirRenderWindow.addEventListener("click", (event) => {
  const bounds = reservoirRenderWindow.getBoundingClientRect();
  const picked = reservoirViewer.pick(event.clientX - bounds.left, event.clientY - bounds.top);
  reservoirInspector.textContent = picked
    ? `Cell ${String(picked.originalCellId)} | IJK ${picked.ijk.join(", ")} | Value ${picked.propertyValue ?? "undefined"}`
    : "No cell selected.";
});
window.addEventListener("beforeunload", () => {
  surfaceWorkerClient.terminate();
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