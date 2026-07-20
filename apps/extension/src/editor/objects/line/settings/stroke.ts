import type { EditorLineSettings } from '../../../../features/editor/document/line-types';
import type { LinePathInstance } from '../types';
import { readLineNumber } from './number';

export function readLineStrokeSettings(
  line: LinePathInstance,
  fallback: EditorLineSettings
): Pick<
  EditorLineSettings,
  'color' | 'width' | 'opacity' | 'style' | 'corners' | 'roughness' | 'bowing'
> {
  return {
    color: line.sniptaleLineColor ?? line.sniptaleLineSettings?.color ?? fallback.color,
    width: readLineNumber(
      line.sniptaleLineWidth,
      line.sniptaleLineSettings?.width ?? fallback.width
    ),
    opacity: readLineNumber(
      line.sniptaleLineOpacity,
      line.sniptaleLineSettings?.opacity ?? fallback.opacity
    ),
    style: line.sniptaleLineStyle ?? line.sniptaleLineSettings?.style ?? fallback.style,
    corners: line.sniptaleLineCorners ?? line.sniptaleLineSettings?.corners ?? fallback.corners,
    roughness: readLineNumber(
      line.sniptaleLineRoughness,
      line.sniptaleLineSettings?.roughness ?? fallback.roughness
    ),
    bowing: readLineNumber(
      line.sniptaleLineBowing,
      line.sniptaleLineSettings?.bowing ?? fallback.bowing ?? 0
    ),
  };
}
