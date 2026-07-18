const defaultDockWidth = 250;

export function initializeDockLayout() {
  const workspace = document.querySelector(".workspace");
  const splitter = document.querySelector("#workspace-splitter");
  const workspaceDock = document.querySelector("#workspace-dock");
  const editorDock = document.querySelector("#editor-dock");
  const vtkDock = document.querySelector("#vtk-dock");
  const workspaceCollapse = document.querySelector("#workspace-dock-collapse");
  const workspaceFloat = document.querySelector("#workspace-dock-float");
  const editorFloat = document.querySelector("#editor-dock-float");
  const vtkFloat = document.querySelector("#vtk-dock-float");

  if (!workspace || !splitter || !workspaceDock || !editorDock || !vtkDock) {
    return;
  }

  let dockWidth = Number.parseInt(
    localStorage.getItem("my-code-editor.workspace-dock-width"),
    10
  );

  if (!Number.isFinite(dockWidth)) {
    dockWidth = defaultDockWidth;
  }

  workspace.style.setProperty("--workspace-dock-width", `${dockWidth}px`);

  workspaceCollapse.addEventListener("click", () => {
    workspaceDock.classList.toggle("is-collapsed");
    workspaceCollapse.textContent = workspaceDock.classList.contains("is-collapsed")
      ? ">"
      : "−";
  });

  workspaceFloat.addEventListener("click", () => {
    toggleFloating(workspaceDock, workspaceFloat);
  });

  editorFloat.addEventListener("click", () => {
    toggleFloating(editorDock, editorFloat);
  });

  vtkFloat.addEventListener("click", () => {
    toggleFloating(vtkDock, vtkFloat);
  });

  splitter.addEventListener("pointerdown", (event) => {
    if (workspaceDock.classList.contains("is-collapsed")) {
      return;
    }

    splitter.setPointerCapture(event.pointerId);
    splitter.classList.add("is-dragging");

    const moveSplitter = (moveEvent) => {
      const nextWidth = Math.min(
        420,
        Math.max(180, moveEvent.clientX - workspace.getBoundingClientRect().left)
      );
      dockWidth = nextWidth;
      workspace.style.setProperty("--workspace-dock-width", `${nextWidth}px`);
    };

    const stopSplitter = () => {
      splitter.classList.remove("is-dragging");
      splitter.removeEventListener("pointermove", moveSplitter);
      splitter.removeEventListener("pointerup", stopSplitter);
      localStorage.setItem(
        "my-code-editor.workspace-dock-width",
        String(dockWidth)
      );
    };

    splitter.addEventListener("pointermove", moveSplitter);
    splitter.addEventListener("pointerup", stopSplitter, { once: true });
  });

  [workspaceDock, editorDock, vtkDock].forEach((dock) => {
    const header = dock.querySelector(".dock-header");
    header.addEventListener("pointerdown", (event) => {
      if (!dock.classList.contains("is-floating") || event.target.closest("button")) {
        return;
      }

      dock.setPointerCapture(event.pointerId);
      const bounds = dock.getBoundingClientRect();
      const offsetX = event.clientX - bounds.left;
      const offsetY = event.clientY - bounds.top;

      const moveDock = (moveEvent) => {
        dock.style.left = `${moveEvent.clientX - offsetX}px`;
        dock.style.top = `${moveEvent.clientY - offsetY}px`;
      };

      const stopDock = () => {
        dock.removeEventListener("pointermove", moveDock);
        dock.removeEventListener("pointerup", stopDock);
      };

      dock.addEventListener("pointermove", moveDock);
      dock.addEventListener("pointerup", stopDock, { once: true });
    });
  });
}

function toggleFloating(dock, button) {
  const willFloat = !dock.classList.contains("is-floating");
  dock.classList.toggle("is-floating", willFloat);
  button.textContent = willFloat ? "↙" : "↗";
  button.title = willFloat ? "停靠窗口" : "浮动窗口";

  if (!willFloat) {
    dock.style.left = "";
    dock.style.top = "";
  }
}
