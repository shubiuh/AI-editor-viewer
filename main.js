const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");

const isDevelopment = !app.isPackaged;

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 500,
    title: "My Code Editor",

    webPreferences: {
      preload: path.join(__dirname, "preload.js"),

      // 不允许网页直接使用 Node.js
      nodeIntegration: false,

      // 将 preload 和网页代码隔离
      contextIsolation: true
    }
  });

  if (isDevelopment) {
    mainWindow.loadURL("http://127.0.0.1:5173");

    // 开发阶段可以打开调试工具
    // mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "dist", "index.html"));
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

/**
 * 打开文件
 */
ipcMain.handle("file:open", async () => {
  const result = await dialog.showOpenDialog({
    title: "打开文件",
    properties: ["openFile"],
    filters: [
      {
        name: "代码和文本文件",
        extensions: [
          "js",
          "jsx",
          "ts",
          "tsx",
          "json",
          "html",
          "css",
          "scss",
          "less",
          "md",
          "xml",
          "yaml",
          "yml",
          "py",
          "java",
          "c",
          "cpp",
          "h",
          "hpp",
          "sql",
          "txt"
        ]
      },
      {
        name: "所有文件",
        extensions: ["*"]
      }
    ]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return {
      canceled: true
    };
  }

  const filePath = result.filePaths[0];

  try {
    const content = await fs.readFile(filePath, "utf8");

    return {
      canceled: false,
      filePath,
      fileName: path.basename(filePath),
      extension: path.extname(filePath).toLowerCase(),
      content
    };
  } catch (error) {
    console.error("读取文件失败：", error);

    return {
      canceled: false,
      error: `读取文件失败：${error.message}`
    };
  }
});

/**
 * 保存已有文件
 */
ipcMain.handle("file:save", async (_event, payload) => {
  if (!payload || typeof payload.filePath !== "string") {
    return {
      success: false,
      error: "缺少有效的文件路径"
    };
  }

  if (typeof payload.content !== "string") {
    return {
      success: false,
      error: "文件内容必须是字符串"
    };
  }

  try {
    await fs.writeFile(payload.filePath, payload.content, "utf8");

    return {
      success: true,
      filePath: payload.filePath
    };
  } catch (error) {
    console.error("保存文件失败：", error);

    return {
      success: false,
      error: `保存文件失败：${error.message}`
    };
  }
});

/**
 * 另存为
 */
ipcMain.handle("file:save-as", async (_event, payload) => {
  const content =
    payload && typeof payload.content === "string"
      ? payload.content
      : "";

  const defaultPath =
    payload && typeof payload.filePath === "string"
      ? payload.filePath
      : "untitled.txt";

  const result = await dialog.showSaveDialog({
    title: "文件另存为",
    defaultPath
  });

  if (result.canceled || !result.filePath) {
    return {
      canceled: true,
      success: false
    };
  }

  try {
    await fs.writeFile(result.filePath, content, "utf8");

    return {
      canceled: false,
      success: true,
      filePath: result.filePath,
      fileName: path.basename(result.filePath),
      extension: path.extname(result.filePath).toLowerCase()
    };
  } catch (error) {
    console.error("另存为失败：", error);

    return {
      canceled: false,
      success: false,
      error: `另存为失败：${error.message}`
    };
  }
});

ipcMain.handle("vtk:open", async () => {
  const result = await dialog.showOpenDialog({
    title: "打开 VTK 文件",
    properties: ["openFile"],
    filters: [
      {
        name: "VTK 数据文件",
        extensions: ["vtk"]
      },
      {
        name: "所有文件",
        extensions: ["*"]
      }
    ]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true };
  }

  const filePath = result.filePaths[0];

  try {
    const content = await fs.readFile(filePath);

    return {
      canceled: false,
      filePath,
      fileName: path.basename(filePath),
      extension: path.extname(filePath).toLowerCase(),
      content: content.toString("base64")
    };
  } catch (error) {
    console.error("读取 VTK 文件失败：", error);

    return {
      canceled: false,
      error: `读取 VTK 文件失败：${error.message}`
    };
  }
});
