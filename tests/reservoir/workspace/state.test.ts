import { describe, expect, it } from "vitest";

import {
  clearWorkspaceError,
  createReservoirWorkspaceState,
  setWorkspaceClip,
  setWorkspaceError,
  setWorkspaceLoading,
  setWorkspaceProgress,
  setWorkspaceProperty,
  setWorkspaceVisibility
} from "../../../src/reservoir/workspace/state";

describe("reservoir workspace state", () => {
  it("keeps UI state immutable and separate from rendering objects", () => {
    const initial = createReservoirWorkspaceState();
    const loading = setWorkspaceLoading(initial);
    const configured = setWorkspaceVisibility(
      setWorkspaceClip(setWorkspaceProperty(loading, "synthetic-porosity"), { i: [0, 1] }),
      { active: true, inactiveNeighborBoundary: false }
    );

    expect(initial.status).toBe("idle");
    expect(configured.status).toBe("loading");
    expect(configured.selectedPropertyId).toBe("synthetic-porosity");
    expect(configured.clip).toEqual({ i: [0, 1] });
    expect(configured.visibility).toEqual({ active: true, inactiveNeighborBoundary: false });
  });

  it("clamps progress and clears a recoverable error", () => {
    const errored = setWorkspaceError(setWorkspaceProgress(createReservoirWorkspaceState(), 2), "Worker unavailable");

    expect(errored.progress).toBe(0);
    expect(clearWorkspaceError(errored)).toMatchObject({ status: "idle", error: undefined });
  });
});