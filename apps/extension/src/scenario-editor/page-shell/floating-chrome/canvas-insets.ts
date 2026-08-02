import type {
  ScenarioCanvasViewportInsets,
  ScenarioCanvasViewportSize,
} from '../../canvas/viewport';

export function resolveScenarioFloatingChromeCanvasInsets(
  viewport: ScenarioCanvasViewportSize
): ScenarioCanvasViewportInsets {
  if (viewport.width <= 720) {
    return { bottom: 188, left: 16, right: 16, top: 136 };
  }

  if (viewport.width <= 1480) {
    return { bottom: 88, left: 304, right: 376, top: 136 };
  }

  return { bottom: 72, left: 336, right: 384, top: 96 };
}
