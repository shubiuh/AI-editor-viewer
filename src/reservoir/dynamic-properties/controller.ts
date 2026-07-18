import type { PropertyFrame } from "../domain/types";
import { PropertyFrameCache } from "./frame-cache";
import { PropertyFrameError, type DroppedFramePolicy, type MissingFrameBehavior } from "./types";

export interface DynamicPropertyControllerOptions {
  readonly onFrame: (frame: PropertyFrame) => void;
  readonly onError: (error: unknown) => void;
  readonly onState?: (state: DynamicPropertyState) => void;
  readonly missingFrameBehavior?: MissingFrameBehavior;
  readonly droppedFramePolicy?: DroppedFramePolicy;
}

export interface DynamicPropertyState {
  readonly propertyId: string | undefined;
  readonly timeStepIndex: number;
  readonly playing: boolean;
  readonly playbackSpeed: number;
  readonly droppedFrames: number;
  readonly lastError: string | undefined;
}

export class DynamicPropertyController {
  private propertyId: string | undefined;
  private timeStepIndex = 0;
  private requestGeneration = 0;
  private activeRequest: AbortController | undefined;
  private playing = false;
  private playbackSpeed = 1;
  private droppedFrames = 0;
  private lastError: string | undefined;
  private timer: ReturnType<typeof setInterval> | undefined;
  private busy = false;
  private queuedTicks = 0;

  public constructor(private readonly cache: PropertyFrameCache, private readonly timeStepCount: number, private readonly options: DynamicPropertyControllerOptions) {}

  public selectProperty(propertyId: string | undefined): void {
    this.activeRequest?.abort();
    this.requestGeneration += 1;
    this.propertyId = propertyId;
    this.timeStepIndex = 0;
    if (!propertyId) {
      this.publishState();
      return;
    }
    void this.loadCurrent();
  }

  public selectTimeStep(timeStepIndex: number): void {
    if (!Number.isSafeInteger(timeStepIndex) || timeStepIndex < 0 || timeStepIndex >= this.timeStepCount) {
      return;
    }
    this.timeStepIndex = timeStepIndex;
    void this.loadCurrent();
  }

  public setPlaybackSpeed(framesPerSecond: number): void {
    if (!Number.isFinite(framesPerSecond) || framesPerSecond <= 0) {
      return;
    }
    this.playbackSpeed = framesPerSecond;
    if (this.playing) {
      this.pause();
      this.play();
    }
    this.publishState();
  }

  public play(): void {
    if (this.playing || !this.propertyId || this.timeStepCount === 0) {
      return;
    }
    this.playing = true;
    this.timer = setInterval(() => this.tick(), 1000 / this.playbackSpeed);
    this.publishState();
  }

  public pause(): void {
    this.playing = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    this.publishState();
  }

  public tick(): void {
    if (!this.playing || !this.propertyId) {
      return;
    }
    if (this.busy) {
      if ((this.options.droppedFramePolicy ?? "drop") === "drop") {
        this.timeStepIndex = (this.timeStepIndex + 1) % this.timeStepCount;
        this.droppedFrames += 1;
        this.publishState();
      } else {
        this.queuedTicks += 1;
      }
      return;
    }
    this.timeStepIndex = (this.timeStepIndex + 1) % this.timeStepCount;
    void this.loadCurrent();
  }

  public getState(): DynamicPropertyState {
    return { propertyId: this.propertyId, timeStepIndex: this.timeStepIndex, playing: this.playing, playbackSpeed: this.playbackSpeed, droppedFrames: this.droppedFrames, lastError: this.lastError };
  }

  public dispose(): void {
    this.pause();
    this.activeRequest?.abort();
  }

  private async loadCurrent(): Promise<void> {
    const propertyId = this.propertyId;
    if (!propertyId) {
      return;
    }
    const generation = ++this.requestGeneration;
    this.activeRequest?.abort();
    const controller = new AbortController();
    this.activeRequest = controller;
    this.busy = true;
    this.publishState();
    try {
      const frame = await this.cache.request(propertyId, this.timeStepIndex, controller.signal);
      if (generation !== this.requestGeneration || controller.signal.aborted) {
        return;
      }
      this.lastError = undefined;
      this.options.onFrame(frame);
      this.cache.prefetchAdjacent(propertyId, this.timeStepIndex);
    } catch (error) {
      if (generation !== this.requestGeneration || isCancelled(error)) {
        return;
      }
      this.lastError = error instanceof Error ? error.message : "Property-frame loading failed.";
      const missing = error instanceof PropertyFrameError && error.code === "missing-frame";
      if (!missing || (this.options.missingFrameBehavior ?? "skip") === "pause") {
        this.pause();
      }
      this.options.onError(error);
    } finally {
      if (generation === this.requestGeneration) {
        this.busy = false;
        this.publishState();
        if (this.playing && this.queuedTicks > 0) {
          this.queuedTicks -= 1;
          this.timeStepIndex = (this.timeStepIndex + 1) % this.timeStepCount;
          void this.loadCurrent();
        }
      }
    }
  }

  private publishState(): void {
    this.options.onState?.(this.getState());
  }
}

function isCancelled(error: unknown): boolean {
  return error instanceof PropertyFrameError && error.code === "cancelled" || error instanceof DOMException && error.name === "AbortError";
}