import { Gradient, type Pattern } from 'fabric';
import {
  createEditorGradientColorStopColor,
  createEditorGradientFallbackStops,
  normalizeEditorGradientStops,
} from '../../../../features/editor/document/gradient';
import { type EditorLineSettings } from '../../../../features/editor/document/line-types';
import { hexToRgba } from '../../../document/model';
import { createLineRoughFillPattern } from '../rough-fill/pattern';
import type { LinePathInstance } from '../types';

export function resolveLineFill(
  line: LinePathInstance,
  settings: EditorLineSettings,
  closed: boolean
): string | Gradient<'linear'> | Pattern {
  if (!closed || settings.fillMode === 'none') {
    return 'transparent';
  }
  if (settings.fillMode === 'gradient') {
    const angle = (settings.gradientAngle * Math.PI) / 180;
    const halfWidth = Math.max(1, (line.width ?? 1) / 2);
    const halfHeight = Math.max(1, (line.height ?? 1) / 2);
    return new Gradient({
      type: 'linear',
      coords: {
        x1: -Math.cos(angle) * halfWidth,
        y1: -Math.sin(angle) * halfHeight,
        x2: Math.cos(angle) * halfWidth,
        y2: Math.sin(angle) * halfHeight,
      },
      colorStops: normalizeEditorGradientStops(
        settings.gradientStops,
        createEditorGradientFallbackStops(settings.gradientFrom, settings.gradientTo)
      ).map((stop) => ({
        offset: stop.offset,
        color: createEditorGradientColorStopColor(stop, settings.fillOpacity),
      })),
    });
  }
  if (settings.fillMode === 'rough') {
    return createLineRoughFillPattern(settings);
  }
  return hexToRgba(settings.fillColor, settings.fillOpacity);
}
