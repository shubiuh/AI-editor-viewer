import type { WellLogDepthMode } from "./plot-model";

export interface SelectedDepthEvent {
  readonly depth: number;
  readonly depthMode: WellLogDepthMode;
  readonly source: "reservoir" | "well-log";
}

export class SelectedDepthController {
  private selectedDepth: SelectedDepthEvent | undefined;
  private readonly listeners = new Set<(event: SelectedDepthEvent) => void>();

  public set(event: SelectedDepthEvent): void {
    if (!Number.isFinite(event.depth)) {
      return;
    }
    this.selectedDepth = event;
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  public get(): SelectedDepthEvent | undefined {
    return this.selectedDepth;
  }

  public subscribe(listener: (event: SelectedDepthEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}