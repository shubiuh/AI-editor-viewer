import * as monaco from "monaco-editor";

export const codeThemes = {
  "cpp-dark": {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment", foreground: "6A9955" },
      { token: "keyword", foreground: "569CD6" },
      { token: "type", foreground: "4EC9B0" },
      { token: "string", foreground: "CE9178" },
      { token: "number", foreground: "B5CEA8" }
    ],
    colors: {
      "editor.background": "#1E1E1E",
      "editor.foreground": "#D4D4D4",
      "editorCursor.foreground": "#F1BD65"
    }
  },
  "cpp-light": {
    base: "vs",
    inherit: true,
    rules: [
      { token: "comment", foreground: "008000" },
      { token: "keyword", foreground: "0000FF" },
      { token: "type", foreground: "267F99" },
      { token: "string", foreground: "A31515" },
      { token: "number", foreground: "098658" }
    ],
    colors: {
      "editor.background": "#FFFFFF",
      "editor.foreground": "#1E1E1E",
      "editorCursor.foreground": "#9A6200"
    }
  },
  monokai: {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment", foreground: "75715E" },
      { token: "keyword", foreground: "F92672" },
      { token: "type", foreground: "66D9EF", fontStyle: "italic" },
      { token: "string", foreground: "E6DB74" },
      { token: "number", foreground: "AE81FF" }
    ],
    colors: {
      "editor.background": "#272822",
      "editor.foreground": "#F8F8F2",
      "editorCursor.foreground": "#F8F8F0"
    }
  },
  dracula: {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment", foreground: "6272A4" },
      { token: "keyword", foreground: "FF79C6" },
      { token: "type", foreground: "8BE9FD", fontStyle: "italic" },
      { token: "string", foreground: "F1FA8C" },
      { token: "number", foreground: "BD93F9" }
    ],
    colors: {
      "editor.background": "#282A36",
      "editor.foreground": "#F8F8F2",
      "editorCursor.foreground": "#F8F8F0"
    }
  }
};

export function registerCodeThemes() {
  Object.entries(codeThemes).forEach(([themeName, themeDefinition]) => {
    monaco.editor.defineTheme(themeName, themeDefinition);
  });
}

export function getStoredTheme(storageKey) {
  const savedTheme = localStorage.getItem(storageKey);
  return Object.hasOwn(codeThemes, savedTheme)
    ? savedTheme
    : "cpp-dark";
}
