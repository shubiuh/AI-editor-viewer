import * as monaco from "monaco-editor";

const languageMap = {
  ".js": "javascript",
  ".jsx": "javascript",
  ".ts": "typescript",
  ".tsx": "typescript",
  ".json": "json",
  ".html": "html",
  ".htm": "html",
  ".css": "css",
  ".scss": "scss",
  ".less": "less",
  ".md": "markdown",
  ".markdown": "markdown",
  ".py": "python",
  ".java": "java",
  ".c": "c",
  ".h": "c",
  ".cpp": "cpp",
  ".cc": "cpp",
  ".cxx": "cpp",
  ".hpp": "cpp",
  ".xml": "xml",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".sh": "shell",
  ".bash": "shell",
  ".sql": "sql",
  ".txt": "plaintext"
};

const languageDisplayNames = {
  javascript: "JavaScript",
  typescript: "TypeScript",
  json: "JSON",
  html: "HTML",
  css: "CSS",
  scss: "SCSS",
  less: "Less",
  markdown: "Markdown",
  python: "Python",
  java: "Java",
  c: "C",
  cpp: "C++",
  xml: "XML",
  yaml: "YAML",
  shell: "Shell",
  sql: "SQL",
  plaintext: "Plain Text"
};

export function getLanguageFromExtension(extension) {
  return languageMap[extension] ?? "plaintext";
}

export function getLanguageDisplayName(language) {
  return languageDisplayNames[language] ?? language;
}

export function createEditor(container, theme) {
  return monaco.editor.create(container, {
    value: [
      "// Welcome to My Code Editor",
      "",
      "function hello() {",
      "  console.log('Hello world');",
      "}",
      "",
      "hello();"
    ].join("\n"),
    language: "javascript",
    theme,
    automaticLayout: true,
    minimap: { enabled: true },
    fontSize: 14,
    lineHeight: 22,
    tabSize: 2,
    insertSpaces: true,
    wordWrap: "off",
    scrollBeyondLastLine: false,
    cursorBlinking: "smooth",
    cursorSmoothCaretAnimation: "on",
    bracketPairColorization: { enabled: true }
  });
}
