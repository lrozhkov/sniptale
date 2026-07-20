import type { EditorLineSettings } from '../../../../features/editor/document/line-types';
import type { LinePathInstance } from '../types';
import { readLineNumber } from './number';
import type { LineRoughFillSettings } from './types';

export function readLineRoughFillSettings(
  line: LinePathInstance,
  fallback: EditorLineSettings
): LineRoughFillSettings {
  return {
    ...readLineRoughFillPatternSettings(line, fallback),
    ...readLineRoughFillTextureSettings(line, fallback),
  };
}

function readLineRoughFillPatternSettings(
  line: LinePathInstance,
  fallback: EditorLineSettings
): Pick<
  LineRoughFillSettings,
  'roughFillStyle' | 'roughFillColor' | 'roughFillGap' | 'roughFillAngle' | 'roughFillWeight'
> {
  return {
    roughFillStyle:
      line.sniptaleLineRoughFillStyle ??
      line.sniptaleLineSettings?.roughFillStyle ??
      fallback.roughFillStyle,
    roughFillColor:
      line.sniptaleLineRoughFillColor ??
      line.sniptaleLineSettings?.roughFillColor ??
      line.sniptaleLineFillColor ??
      line.sniptaleLineSettings?.fillColor ??
      fallback.roughFillColor,
    roughFillGap: readLineNumber(
      line.sniptaleLineRoughFillGap,
      line.sniptaleLineSettings?.roughFillGap ?? fallback.roughFillGap
    ),
    roughFillAngle: readLineNumber(
      line.sniptaleLineRoughFillAngle,
      line.sniptaleLineSettings?.roughFillAngle ?? fallback.roughFillAngle
    ),
    roughFillWeight: readLineNumber(
      line.sniptaleLineRoughFillWeight,
      line.sniptaleLineSettings?.roughFillWeight ?? fallback.roughFillWeight
    ),
  };
}

function readLineRoughFillTextureSettings(
  line: LinePathInstance,
  fallback: EditorLineSettings
): Pick<LineRoughFillSettings, 'roughFillRoughness' | 'roughFillBowing' | 'roughFillOpacity'> {
  return {
    roughFillRoughness: readLineNumber(
      line.sniptaleLineRoughFillRoughness,
      line.sniptaleLineSettings?.roughFillRoughness ??
        line.sniptaleLineSettings?.roughness ??
        fallback.roughFillRoughness
    ),
    roughFillBowing: readLineNumber(
      line.sniptaleLineRoughFillBowing,
      line.sniptaleLineSettings?.roughFillBowing ??
        line.sniptaleLineSettings?.bowing ??
        fallback.roughFillBowing
    ),
    roughFillOpacity: readLineNumber(
      line.sniptaleLineRoughFillOpacity,
      line.sniptaleLineSettings?.roughFillOpacity ??
        line.sniptaleLineSettings?.fillOpacity ??
        fallback.roughFillOpacity
    ),
  };
}
