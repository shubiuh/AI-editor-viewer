const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
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
    })
});