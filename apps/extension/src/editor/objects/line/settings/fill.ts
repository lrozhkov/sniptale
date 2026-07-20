import {
  createEditorGradientFallbackStops,
  normalizeEditorGradientStops,
} from '../../../../features/editor/document/gradient';
import { type EditorLineSettings } from '../../../../features/editor/document/line-types';
import type { LinePathInstance } from '../types';
import { readLineNumber } from './number';

export function readLineFillSettings(
  line: LinePathInstance,
  fallback: EditorLineSettings
): Pick<
  EditorLineSettings,
  | 'fillMode'
  | 'fillColor'
  | 'fillOpacity'
  | 'gradientFrom'
  | 'gradientTo'
  | 'gradientStops'
  | 'gradientAngle'
> {
  const gradientFrom =
    line.sniptaleLineGradientFrom ??
    line.sniptaleLineSettings?.gradientFrom ??
    fallback.gradientFrom;
  const gradientTo =
    line.sniptaleLineGradientTo ?? line.sniptaleLineSettings?.gradientTo ?? fallback.gradientTo;
  return {
    fillMode: line.sniptaleLineFillMode ?? line.sniptaleLineSettings?.fillMode ?? fallback.fillMode,
    fillColor:
      line.sniptaleLineFillColor ?? line.sniptaleLineSettings?.fillColor ?? fallback.fillColor,
    fillOpacity: readLineNumber(
      line.sniptaleLineFillOpacity,
      line.sniptaleLineSettings?.fillOpacity ?? fallback.fillOpacity
    ),
    gradientFrom,
    gradientTo,
    gradientStops: normalizeEditorGradientStops(
      line.sniptaleLineGradientStops ?? line.sniptaleLineSettings?.gradientStops,
      createEditorGradientFallbackStops(gradientFrom, gradientTo)
    ),
    gradientAngle: readLineNumber(
      line.sniptaleLineGradientAngle,
      line.sniptaleLineSettings?.gradientAngle ?? fallback.gradientAngle
    ),
  };
}
