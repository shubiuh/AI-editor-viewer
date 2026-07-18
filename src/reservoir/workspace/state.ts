import type { IJKClip, ReservoirRepresentation, ReservoirVisibility } from "../rendering/types";

export type ReservoirWorkspaceStatus = "idle" | "loading" | "ready" | "cancelled" | "error";

export interface ReservoirWorkspaceState {
  readonly status: ReservoirWorkspaceStatus;
  readonly selectedPropertyId: string | undefined;
  readonly visibility: ReservoirVisibility;
  readonly clip: IJKClip;
  readonly representation: ReservoirRepresentation;
  readonly error: string | undefined;
  readonly progress: number;
}

export function createReservoirWorkspaceState(): ReservoirWorkspaceState {
  return {
    status: "idle",
    selectedPropertyId: undefined,
    visibility: { active: true, inactiveNeighborBoundary: true },
    clip: {},
    representation: "surface-with-edges",
    error: undefined,
    progress: 0
  };
}

export function setWorkspaceLoading(state: ReservoirWorkspaceState): ReservoirWorkspaceState {
  return { ...state, status: "loading", error: undefined, progress: 0 };
}

export function setWorkspaceReady(state: ReservoirWorkspaceState): ReservoirWorkspaceState {
  return { ...state, status: "ready", error: undefined, progress: 1 };
}

export function setWorkspaceProgress(state: ReservoirWorkspaceState, progress: number): ReservoirWorkspaceState {
  return { ...state, progress: Math.min(1, Math.max(0, progress)) };
}

export function setWorkspaceError(state: ReservoirWorkspaceState, error: string): ReservoirWorkspaceState {
  return { ...state, status: "error", error, progress: 0 };
}

export function clearWorkspaceError(state: ReservoirWorkspaceState): ReservoirWorkspaceState {
  return state.status === "error" ? { ...state, status: "idle", error: undefined } : state;
}

export function setWorkspaceProperty(state: ReservoirWorkspaceState, propertyId: string | undefined): ReservoirWorkspaceState {
  return { ...state, selectedPropertyId: propertyId };
}

export function setWorkspaceVisibility(state: ReservoirWorkspaceState, visibility: ReservoirVisibility): ReservoirWorkspaceState {
  return { ...state, visibility };
}

export function setWorkspaceClip(state: ReservoirWorkspaceState, clip: IJKClip): ReservoirWorkspaceState {
  return { ...state, clip };
}

export function setWorkspaceRepresentation(state: ReservoirWorkspaceState, representation: ReservoirRepresentation): ReservoirWorkspaceState {
  return { ...state, representation };
}