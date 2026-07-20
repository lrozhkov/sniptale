import type { EditorBrushSettings } from '../../../../../features/editor/document/types';
import type { FreehandPointRecord } from '../../points';
import type { FreehandStrokeSample } from '../../samples';
import type { DynamicStrokePoint } from '../types';
import { resolveWarmStartRatios, resolveSpeedRatios } from './ratios';
import { normalizeStrokeSamples } from './samples';

const WIDTH_EASING = 0.24;

export function resolveDynamicWidthPoints(
  points: readonly FreehandPointRecord[],
  settings: EditorBrushSettings,
  samples: readonly FreehandStrokeSample[] | null | undefined
): DynamicStrokePoint[] {
  const normalized = normalizeStrokeSamples(points, samples);
  const widthRatios = resolveWarmStartRatios(normalized, resolveSpeedRatios(normalized));
  let previousWidth = settings.width * (widthRatios[0] ?? 1);
  return normalized.map((sample, index) => {
    const targetRatio = widthRatios[index] ?? 1;
    const nextWidth =
      previousWidth * (1 - WIDTH_EASING) + settings.width * targetRatio * WIDTH_EASING;
    previousWidth = nextWidth;
    return { x: sample.x, y: sample.y, width: nextWidth };
  });
}
