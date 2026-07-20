import type { EditorLineSettings } from '../../../../features/editor/document/line-types';
import type { LinePathInstance } from '../types';
import { readLineNumber } from './number';

export function readLineShadowSettings(
  line: LinePathInstance,
  fallback: EditorLineSettings
): Pick<
  EditorLineSettings,
  'shadow' | 'shadowAngle' | 'shadowBlur' | 'shadowColor' | 'shadowDistance'
> {
  return {
    shadow: readLineNumber(
      line.sniptaleLineShadow,
      line.sniptaleLineSettings?.shadow ?? fallback.shadow
    ),
    shadowAngle: readLineNumber(
      line.sniptaleLineShadowAngle,
      line.sniptaleLineSettings?.shadowAngle ?? fallback.shadowAngle ?? 90
    ),
    shadowBlur: readLineNumber(
      line.sniptaleLineShadowBlur,
      line.sniptaleLineSettings?.shadowBlur ?? fallback.shadowBlur ?? 12
    ),
    shadowColor:
      line.sniptaleLineShadowColor ??
      line.sniptaleLineSettings?.shadowColor ??
      line.sniptaleLineColor ??
      line.sniptaleLineSettings?.color ??
      fallback.shadowColor,
    shadowDistance: readLineNumber(
      line.sniptaleLineShadowDistance,
      line.sniptaleLineSettings?.shadowDistance ?? fallback.shadowDistance ?? 4
    ),
  };
}
