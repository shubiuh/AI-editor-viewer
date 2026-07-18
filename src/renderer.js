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

  renderTabs.forEach((tab) => {
    const isActive = tab.dataset.renderTab === tabName;
    tab.classList.toggle("active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
  });

  editorDock.classList.toggle("is-render-active", isEditor);
  vtkDock.classList.toggle("is-render-active", isVtk || isGlance);
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
  });
}

renderTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    selectRenderTab(tab.dataset.renderTab);
  });
});

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