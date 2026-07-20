import { normalizeEditorArrowHeadSize } from '../../../features/editor/document/arrow';
import type { EditorArrowSettings } from '../../../features/editor/document/types';
import { isBoolean, isNumber, isRecord, isString } from '../infrastructure/guards/primitives';
import { isLineStyle } from './line-style-parser';
import { parsePresetShadowSettings } from './shadow-setting-parser';

const EDITOR_ARROW_HEAD_VALUES = new Set([
  'none',
  'arrow',
  'triangle',
  'triangle-outline',
  'bar',
  'circle',
  'circle-outline',
  'diamond',
  'diamond-outline',
  'crosshair-circle',
  'open',
  'block',
]);

function isArrowHead(value: unknown): value is EditorArrowSettings['startHead'] {
  return isString(value) && EDITOR_ARROW_HEAD_VALUES.has(value);
}

function isArrowType(value: unknown): value is NonNullable<EditorArrowSettings['arrowType']> {
  return value === 'sharp' || value === 'curved' || value === 'elbow';
}

function isArrowVariant(value: unknown): value is EditorArrowSettings['variant'] {
  return value === 'standard' || value === 'tapered';
}

function hasValidOptionalArrowSettings(value: Record<string, unknown>): boolean {
  return (
    (value['style'] === undefined || isLineStyle(value['style'])) &&
    (value['roughness'] === undefined || isNumber(value['roughness'])) &&
    (value['bowing'] === undefined || isNumber(value['bowing'])) &&
    (value['variant'] === undefined || isArrowVariant(value['variant'])) &&
    (value['arrowType'] === undefined || isArrowType(value['arrowType'])) &&
    (value['dynamicWidth'] === undefined || isBoolean(value['dynamicWidth'])) &&
    (value['startHeadSize'] === undefined || isNumber(value['startHeadSize'])) &&
    (value['endHeadSize'] === undefined || isNumber(value['endHeadSize']))
  );
}

export function parseArrowSettings(value: unknown): EditorArrowSettings | null {
  if (!isRecord(value)) {
    return null;
  }

  const color = value['color'];
  const width = value['width'];
  const opacity = value['opacity'];
  const shadow = value['shadow'];
  const mode = value['mode'];
  const startHead = value['startHead'];
  const endHead = value['endHead'];

  if (
    !isString(color) ||
    !isNumber(width) ||
    !isNumber(opacity) ||
    !isNumber(shadow) ||
    (mode !== 'straight' && mode !== 'curve') ||
    !isArrowHead(startHead) ||
    !isArrowHead(endHead) ||
    !hasValidOptionalArrowSettings(value)
  ) {
    return null;
  }

  const settings: EditorArrowSettings = {
    color,
    width,
    style: isLineStyle(value['style']) ? value['style'] : 'solid',
    opacity,
    shadow,
    ...parsePresetShadowSettings(value, color),
    variant: value['variant'] === 'tapered' ? 'tapered' : 'standard',
    mode,
    startHead,
    endHead,
    startHeadSize: normalizeEditorArrowHeadSize(value['startHeadSize']),
    endHeadSize: normalizeEditorArrowHeadSize(value['endHeadSize']),
    roughness: isNumber(value['roughness']) ? value['roughness'] : 0,
    bowing: isNumber(value['bowing']) ? value['bowing'] : 0,
  };
  if (isArrowType(value['arrowType'])) {
    settings.arrowType = value['arrowType'];
  }
  if (isBoolean(value['dynamicWidth'])) {
    settings.dynamicWidth = value['dynamicWidth'];
  }
  return settings;
}
