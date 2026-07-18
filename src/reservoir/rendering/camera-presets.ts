import type { GeologicalCameraPose, GeologicalView } from "./types";

export function geologicalCameraPose(bounds: Float64Array, view: GeologicalView): GeologicalCameraPose {
  const center: readonly [number, number, number] = [
    ((bounds[0] ?? 0) + (bounds[1] ?? 0)) / 2,
    ((bounds[2] ?? 0) + (bounds[3] ?? 0)) / 2,
    ((bounds[4] ?? 0) + (bounds[5] ?? 0)) / 2
  ];
  const span = Math.max(
    (bounds[1] ?? 0) - (bounds[0] ?? 0),
    (bounds[3] ?? 0) - (bounds[2] ?? 0),
    (bounds[5] ?? 0) - (bounds[4] ?? 0),
    1
  ) * 2;

  switch (view) {
    case "top":
      return { position: [center[0], center[1], center[2] - span], focalPoint: center, viewUp: [0, 1, 0] };
    case "bottom":
      return { position: [center[0], center[1], center[2] + span], focalPoint: center, viewUp: [0, 1, 0] };
    case "north":
      return { position: [center[0], center[1] + span, center[2]], focalPoint: center, viewUp: [0, 0, -1] };
    case "south":
      return { position: [center[0], center[1] - span, center[2]], focalPoint: center, viewUp: [0, 0, -1] };
    case "east":
      return { position: [center[0] + span, center[1], center[2]], focalPoint: center, viewUp: [0, 0, -1] };
    case "west":
      return { position: [center[0] - span, center[1], center[2]], focalPoint: center, viewUp: [0, 0, -1] };
    default:
      return { position: [center[0] + span, center[1] - span, center[2] - span], focalPoint: center, viewUp: [0, 0, -1] };
  }
}