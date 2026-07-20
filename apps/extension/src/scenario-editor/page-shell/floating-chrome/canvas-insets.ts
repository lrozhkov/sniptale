import type {
  ScenarioCanvasViewportInsets,
  ScenarioCanvasViewportSize,
} from '../../canvas/viewport';

export function resolveScenarioFloatingChromeCanvasInsets(
  viewport: ScenarioCanvasViewportSize,
  options: { timelineHidden?: boolean } = {}
): ScenarioCanvasViewportInsets {
  const bottomInset = options.timelineHidden ? 72 : 176;
  if (viewport.width <= 720) {
    return { bottom: 188, left: 16, right: 16, top: 136 };
  }

  if (viewport.width <= 1480) {
    return { bottom: options.timelineHidden ? 88 : 168, left: 304, right: 376, top: 136 };
  }

  return { bottom: bottomInset, left: 336, right: 384, top: 96 };
}
