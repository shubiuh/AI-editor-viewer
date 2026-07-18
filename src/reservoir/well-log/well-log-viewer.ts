import {
  curveValueRange,
  depthRangeForCurves,
  depthValuesForMode,
  formatCurveRange,
  segmentCurveForDepthRange,
  supportsDepthMode,
  type WellLogDepthMode,
  type WellLogHorizontalScale,
  type WellLogPlotCurve,
  type WellLogValueRange
} from "./plot-model";
import type { SelectedDepthEvent } from "./selected-depth-controller";

export interface WellLogTrackSettings {
  readonly curveId: string;
  readonly visible: boolean;
  readonly scale: WellLogHorizontalScale;
  readonly range: WellLogValueRange;
}

export interface WellLogViewerOptions {
  readonly onSelectedDepth: (event: SelectedDepthEvent) => void;
}

export function defaultWellLogTrackSettings(curve: WellLogPlotCurve): WellLogTrackSettings {
  return { curveId: curveId(curve), visible: true, scale: "linear", range: curveValueRange(curve.curve) };
}

export class WellLogViewer {
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private readonly resizeObserver: ResizeObserver;
  private curves: readonly WellLogPlotCurve[] = [];
  private trackSettings: readonly WellLogTrackSettings[] = [];
  private depthMode: WellLogDepthMode = "md";
  private depthRange: WellLogValueRange | undefined;
  private selectedDepth: number | undefined;
  private dragStart: { readonly y: number; readonly range: WellLogValueRange } | undefined;
  private dragged = false;

  public constructor(private readonly container: HTMLElement, private readonly options: WellLogViewerOptions) {
    this.canvas = document.createElement("canvas");
    this.canvas.className = "well-log-canvas";
    this.canvas.setAttribute("aria-label", "Well log plot with shared vertical depth axis");
    const context = this.canvas.getContext("2d");
    if (!context) {
      throw new Error("Canvas 2D rendering is unavailable.");
    }
    this.context = context;
    container.replaceChildren(this.canvas);
    this.resizeObserver = new ResizeObserver(() => this.draw());
    this.resizeObserver.observe(container);
    this.canvas.addEventListener("pointerdown", (event) => this.beginDrag(event));
    this.canvas.addEventListener("pointermove", (event) => this.drag(event));
    this.canvas.addEventListener("pointerup", (event) => this.finishDrag(event));
    this.canvas.addEventListener("pointerleave", (event) => this.finishDrag(event));
    this.canvas.addEventListener("wheel", (event) => this.zoom(event), { passive: false });
  }

  public setCurves(curves: readonly WellLogPlotCurve[]): void {
    this.curves = curves;
    this.trackSettings = curves.map(defaultWellLogTrackSettings);
    this.depthRange = depthRangeForCurves(curves, this.depthMode);
    this.draw();
  }

  public setTrackSettings(settings: readonly WellLogTrackSettings[]): void {
    this.trackSettings = settings;
    this.draw();
  }

  public setDepthMode(mode: WellLogDepthMode): boolean {
    if (!supportsDepthMode(this.curves, mode)) {
      return false;
    }
    this.depthMode = mode;
    this.depthRange = depthRangeForCurves(this.curves, mode);
    this.draw();
    return true;
  }

  public setSelectedDepth(event: SelectedDepthEvent): void {
    if (event.depthMode !== this.depthMode) {
      return;
    }
    this.selectedDepth = event.depth;
    this.draw();
  }

  public getDepthMode(): WellLogDepthMode {
    return this.depthMode;
  }

  public getDepthRange(): WellLogValueRange | undefined {
    return this.depthRange;
  }

  public dispose(): void {
    this.resizeObserver.disconnect();
    this.canvas.remove();
  }

  private draw(): void {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width <= 0 || height <= 0) {
      return;
    }
    const pixelRatio = window.devicePixelRatio || 1;
    this.canvas.width = Math.floor(width * pixelRatio);
    this.canvas.height = Math.floor(height * pixelRatio);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    this.context.clearRect(0, 0, width, height);
    this.context.fillStyle = "#11171d";
    this.context.fillRect(0, 0, width, height);
    const range = this.depthRange;
    const visible = this.curves.filter((curve) => this.settingsFor(curve)?.visible);
    if (!range || visible.length === 0) {
      this.drawEmptyState(width, height);
      return;
    }
    const bounds = { left: 56, right: 12, top: 30, bottom: 22 };
    const plotWidth = width - bounds.left - bounds.right;
    const plotHeight = height - bounds.top - bounds.bottom;
    if (plotWidth <= 0 || plotHeight <= 0) {
      return;
    }
    this.drawDepthGrid(range, bounds, plotWidth, plotHeight);
    const trackWidth = plotWidth / visible.length;
    visible.forEach((curve, index) => this.drawTrack(curve, index, visible.length, range, bounds, trackWidth, plotHeight));
    this.drawCursor(range, bounds, plotWidth, plotHeight);
  }

  private drawDepthGrid(range: WellLogValueRange, bounds: PlotBounds, plotWidth: number, plotHeight: number): void {
    this.context.strokeStyle = "#2b3740";
    this.context.fillStyle = "#94a3ad";
    this.context.font = "10px 'IBM Plex Mono', Consolas, monospace";
    this.context.textAlign = "right";
    this.context.textBaseline = "middle";
    for (let tick = 0; tick <= 5; tick += 1) {
      const fraction = tick / 5;
      const y = bounds.top + plotHeight * fraction;
      const depth = range.minimum + (range.maximum - range.minimum) * fraction;
      this.context.beginPath();
      this.context.moveTo(bounds.left, y);
      this.context.lineTo(bounds.left + plotWidth, y);
      this.context.stroke();
      this.context.fillText(formatDepth(depth), bounds.left - 7, y);
    }
    this.context.save();
    this.context.translate(13, bounds.top + plotHeight / 2);
    this.context.rotate(-Math.PI / 2);
    this.context.fillStyle = "#c4d0d8";
    this.context.textAlign = "center";
    this.context.fillText(this.depthMode.toUpperCase(), 0, 0);
    this.context.restore();
  }

  private drawTrack(curve: WellLogPlotCurve, index: number, count: number, depthRange: WellLogValueRange, bounds: PlotBounds, trackWidth: number, plotHeight: number): void {
    const settings = this.settingsFor(curve);
    if (!settings) {
      return;
    }
    const left = bounds.left + index * trackWidth;
    const right = left + trackWidth;
    this.context.strokeStyle = "#3a4954";
    this.context.strokeRect(left, bounds.top, trackWidth, plotHeight);
    this.context.strokeStyle = "#26333c";
    for (let tick = 1; tick < 4; tick += 1) {
      const x = left + trackWidth * tick / 4;
      this.context.beginPath();
      this.context.moveTo(x, bounds.top);
      this.context.lineTo(x, bounds.top + plotHeight);
      this.context.stroke();
    }
    this.context.fillStyle = cssColor(curve.color);
    this.context.font = "600 10px 'IBM Plex Sans', Segoe UI, sans-serif";
    this.context.textAlign = "left";
    this.context.textBaseline = "alphabetic";
    this.context.fillText(curve.curve.mnemonic, left + 5, 13);
    this.context.fillStyle = "#a9b8c3";
    this.context.font = "9px 'IBM Plex Mono', Consolas, monospace";
    this.context.fillText(curve.curve.unit.symbol, left + 5, 25);
    this.context.textAlign = "right";
    this.context.fillText(formatCurveRange(settings.range, ""), right - 5, 13);

    const depths = depthValuesForMode(curve, this.depthMode);
    const segments = segmentCurveForDepthRange(curve.curve, depths, depthRange);
    this.context.strokeStyle = cssColor(curve.color);
    this.context.lineWidth = 1.5;
    for (const segment of segments) {
      this.context.beginPath();
      for (let sample = segment.start; sample <= segment.end; sample += 1) {
        const value = curve.curve.values[sample] ?? Number.NaN;
        const depth = depths[sample] ?? Number.NaN;
        const x = left + mapValue(value, settings.range, settings.scale) * trackWidth;
        const y = bounds.top + mapDepth(depth, depthRange) * plotHeight;
        if (sample === segment.start) {
          this.context.moveTo(x, y);
        } else {
          this.context.lineTo(x, y);
        }
      }
      this.context.stroke();
    }
  }

  private drawCursor(range: WellLogValueRange, bounds: PlotBounds, plotWidth: number, plotHeight: number): void {
    if (this.selectedDepth === undefined || this.selectedDepth < range.minimum || this.selectedDepth > range.maximum) {
      return;
    }
    const y = bounds.top + mapDepth(this.selectedDepth, range) * plotHeight;
    this.context.save();
    this.context.strokeStyle = "#f2c14e";
    this.context.setLineDash([4, 3]);
    this.context.beginPath();
    this.context.moveTo(bounds.left, y);
    this.context.lineTo(bounds.left + plotWidth, y);
    this.context.stroke();
    this.context.restore();
  }

  private drawEmptyState(width: number, height: number): void {
    this.context.fillStyle = "#71818d";
    this.context.font = "12px 'IBM Plex Sans', Segoe UI, sans-serif";
    this.context.textAlign = "center";
    this.context.fillText("No visible well-log curves", width / 2, height / 2);
  }

  private settingsFor(curve: WellLogPlotCurve): WellLogTrackSettings | undefined {
    return this.trackSettings.find((settings) => settings.curveId === curveId(curve));
  }

  private beginDrag(event: PointerEvent): void {
    if (!this.depthRange) {
      return;
    }
    this.canvas.setPointerCapture(event.pointerId);
    this.dragStart = { y: event.offsetY, range: this.depthRange };
    this.dragged = false;
  }

  private drag(event: PointerEvent): void {
    if (!this.dragStart) {
      return;
    }
    const plotHeight = Math.max(1, this.container.clientHeight - 52);
    const deltaDepth = (event.offsetY - this.dragStart.y) / plotHeight * (this.dragStart.range.maximum - this.dragStart.range.minimum);
    this.depthRange = { minimum: this.dragStart.range.minimum - deltaDepth, maximum: this.dragStart.range.maximum - deltaDepth };
    this.dragged = this.dragged || Math.abs(event.offsetY - this.dragStart.y) > 3;
    this.draw();
  }

  private finishDrag(event: PointerEvent): void {
    if (!this.dragStart || !this.depthRange) {
      return;
    }
    if (!this.dragged) {
      const depth = this.depthRange.minimum + clamp((event.offsetY - 30) / Math.max(1, this.container.clientHeight - 52), 0, 1) * (this.depthRange.maximum - this.depthRange.minimum);
      this.options.onSelectedDepth({ source: "well-log", depthMode: this.depthMode, depth });
    }
    this.dragStart = undefined;
  }

  private zoom(event: WheelEvent): void {
    if (!this.depthRange) {
      return;
    }
    event.preventDefault();
    const fraction = clamp((event.offsetY - 30) / Math.max(1, this.container.clientHeight - 52), 0, 1);
    const focus = this.depthRange.minimum + fraction * (this.depthRange.maximum - this.depthRange.minimum);
    const factor = event.deltaY < 0 ? 0.8 : 1.25;
    const span = (this.depthRange.maximum - this.depthRange.minimum) * factor;
    this.depthRange = { minimum: focus - fraction * span, maximum: focus + (1 - fraction) * span };
    this.draw();
  }
}

interface PlotBounds {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

function curveId(curve: WellLogPlotCurve): string {
  return `${curve.curve.wellId}:${curve.curve.mnemonic}`;
}

function mapValue(value: number, range: WellLogValueRange, scale: WellLogHorizontalScale): number {
  if (scale === "logarithmic") {
    return clamp((Math.log10(value) - Math.log10(range.minimum)) / (Math.log10(range.maximum) - Math.log10(range.minimum)), 0, 1);
  }
  return clamp((value - range.minimum) / (range.maximum - range.minimum), 0, 1);
}

function mapDepth(depth: number, range: WellLogValueRange): number {
  return (depth - range.minimum) / (range.maximum - range.minimum);
}

function cssColor(color: readonly [number, number, number]): string {
  return `rgb(${Math.round(color[0] * 255)}, ${Math.round(color[1] * 255)}, ${Math.round(color[2] * 255)})`;
}

function formatDepth(depth: number): string {
  return Math.abs(depth) >= 100 ? depth.toFixed(0) : depth.toFixed(1);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}