import type { EditorLineSettings } from '../../../features/editor/document/line-types';
import { isNumber, isRecord, isString } from '../infrastructure/guards/primitives';
import { isLineStyle } from './line-style-parser';
import { parsePresetShadowSettings } from './shadow-setting-parser';

export function parseLineSettings(value: unknown): EditorLineSettings | null {
  if (!isRecord(value) || !isValidLineSettings(value)) {
    return null;
  }

  return {
    color: value['color'],
    width: value['width'],
    style: value['style'],
    corners: value['corners'],
    roughness: value['roughness'],
    bowing: value['bowing'] ?? 0,
    opacity: value['opacity'],
    ...parseLineShadowSettings(value),
    ...parseLineFillSettings(value),
    ...parseLineRoughFillSettings(value),
  };
}

type LineSettingsRecord = Record<string, unknown>;

function isValidLineSettings(value: LineSettingsRecord): value is LineSettingsRecord & {
  color: string;
  width: number;
  style: EditorLineSettings['style'];
  corners: EditorLineSettings['corners'];
  roughness: number;
  bowing?: number;
  opacity: number;
  fillMode: EditorLineSettings['fillMode'];
  fillColor: string;
  fillOpacity: number;
  gradientFrom: string;
  gradientTo: string;
  gradientAngle: number;
  roughFillStyle: EditorLineSettings['roughFillStyle'];
  roughFillColor?: string;
  roughFillGap: number;
  roughFillAngle: number;
  roughFillWeight: number;
  roughFillRoughness?: number;
  roughFillBowing?: number;
  roughFillOpacity?: number;
} {
  return (
    isString(value['color']) &&
    isNumber(value['width']) &&
    isLineStyle(value['style']) &&
    isLineCorners(value['corners']) &&
    isNumber(value['roughness']) &&
    (value['bowing'] === undefined || isNumber(value['bowing'])) &&
    isNumber(value['opacity']) &&
    isValidFillSettings(value) &&
    isValidRoughFillSettings(value)
  );
}

function isLineCorners(value: unknown): value is EditorLineSettings['corners'] {
  return value === 'round' || value === 'sharp';
}

function isValidFillSettings(value: LineSettingsRecord): boolean {
  return (
    (value['fillMode'] === 'none' ||
      value['fillMode'] === 'color' ||
      value['fillMode'] === 'gradient' ||
      value['fillMode'] === 'rough') &&
    isString(value['fillColor']) &&
    isNumber(value['fillOpacity']) &&
    isString(value['gradientFrom']) &&
    isString(value['gradientTo']) &&
    isNumber(value['gradientAngle'])
  );
}

function isValidRoughFillSettings(value: LineSettingsRecord): boolean {
  return (
    isLineRoughFillStyle(value['roughFillStyle']) &&
    (value['roughFillColor'] === undefined || isString(value['roughFillColor'])) &&
    isNumber(value['roughFillGap']) &&
    isNumber(value['roughFillAngle']) &&
    isNumber(value['roughFillWeight']) &&
    (value['roughFillRoughness'] === undefined || isNumber(value['roughFillRoughness'])) &&
    (value['roughFillBowing'] === undefined || isNumber(value['roughFillBowing'])) &&
    (value['roughFillOpacity'] === undefined || isNumber(value['roughFillOpacity']))
  );
}

function isLineRoughFillStyle(value: unknown): value is EditorLineSettings['roughFillStyle'] {
  return (
    value === 'hachure' ||
    value === 'solid' ||
    value === 'zigzag' ||
    value === 'cross-hatch' ||
    value === 'dots' ||
    value === 'dashed' ||
    value === 'zigzag-line'
  );
}

function parseLineShadowSettings(
  value: LineSettingsRecord & { color: string }
): Pick<
  EditorLineSettings,
  'shadow' | 'shadowAngle' | 'shadowBlur' | 'shadowColor' | 'shadowDistance'
> {
  return {
    shadow: isNumber(value['shadow']) ? value['shadow'] : 0,
    ...parsePresetShadowSettings(value, value.color),
  };
}

function parseLineFillSettings(
  value: LineSettingsRecord & {
    fillColor: string;
    fillMode: EditorLineSettings['fillMode'];
    fillOpacity: number;
    gradientAngle: number;
    gradientFrom: string;
    gradientTo: string;
  }
): Pick<
  EditorLineSettings,
  'fillMode' | 'fillColor' | 'fillOpacity' | 'gradientFrom' | 'gradientTo' | 'gradientAngle'
> {
  return {
    fillMode: value.fillMode,
    fillColor: value.fillColor,
    fillOpacity: value.fillOpacity,
    gradientFrom: value.gradientFrom,
    gradientTo: value.gradientTo,
    gradientAngle: value.gradientAngle,
  };
}

function parseLineRoughFillSettings(
  value: LineSettingsRecord & {
    fillColor: string;
    fillOpacity: number;
    roughFillAngle: number;
    roughFillColor?: string;
    roughFillGap: number;
    roughFillStyle: EditorLineSettings['roughFillStyle'];
    roughFillWeight: number;
    roughness: number;
    bowing?: number;
  }
): Pick<
  EditorLineSettings,
  | 'roughFillStyle'
  | 'roughFillColor'
  | 'roughFillGap'
  | 'roughFillAngle'
  | 'roughFillWeight'
  | 'roughFillRoughness'
  | 'roughFillBowing'
  | 'roughFillOpacity'
> {
  return {
    roughFillStyle: value.roughFillStyle,
    roughFillColor: value.roughFillColor ?? value.fillColor,
    roughFillGap: value.roughFillGap,
    roughFillAngle: value.roughFillAngle,
    roughFillWeight: value.roughFillWeight,
    roughFillRoughness: readNumber(value['roughFillRoughness'], value.roughness),
    roughFillBowing: readNumber(value['roughFillBowing'], value.bowing ?? 0),
    roughFillOpacity: readNumber(value['roughFillOpacity'], value.fillOpacity),
  };
}

function readNumber(value: unknown, fallback: number): number {
  return isNumber(value) ? value : fallback;
}
