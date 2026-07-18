const { contextBridge, ipcRenderer } = require("electron");

const reservoirFiles = Object.freeze({
  open: () => ipcRenderer.invoke("reservoir:file-open"),
  readRange: (token, offset, length) => ipcRenderer.invoke("reservoir:file-read-range", { token, offset, length }),
  release: (token) => ipcRenderer.invoke("reservoir:file-release", token)
});

const electronAPI = Object.freeze({
  openFile: () => ipcRenderer.invoke("file:open"),

  openVtkFile: () => ipcRenderer.invoke("vtk:open"),

  saveFile: (filePath, content) =>
    ipcRenderer.invoke("file:save", {
      filePath,
      content
    }),

  saveFileAs: (filePath, content) =>
    ipcRenderer.invoke("file:save-as", {
      filePath,
      content
    }),

  reservoirFiles
});

contextBridge.exposeInMainWorld("electronAPI", electronAPI);