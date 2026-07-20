import type { BlurSettings } from '../../../features/highlighter/contracts';
import type {
  EditorBrushSettings,
  EditorShapeSettings,
} from '../../../features/editor/document/types';
import type { EditorStepSettings } from '../../../features/editor/document/step-types';
import { isBoolean, isNumber, isRecord, isString } from '../infrastructure/guards/primitives';
export { parseArrowSettings } from './arrow-setting-parser';
export { parseLineSettings } from './line-setting-parser';
import { isLineStyle } from './line-style-parser';
export { parseSceneBackgroundSettings } from './scene-background-setting-parser';
import { parsePresetShadowSettings } from './shadow-setting-parser';
export { parseTextSettings } from './text-setting-parser';

function isBlurStrokeStyle(value: unknown): value is NonNullable<BlurSettings['strokeStyle']> {
  return isLineStyle(value) || value === 'dashed' || value === 'dotted';
}

export function parseBlurSettings(value: unknown): BlurSettings | null {
  if (
    !isRecord(value) ||
    !isNumber(value['amount']) ||
    (value['blurType'] !== 'gaussian' &&
      value['blurType'] !== 'distortion' &&
      value['blurType'] !== 'pixelate' &&
      value['blurType'] !== 'solid') ||
    (value['showBorder'] !== undefined && !isBoolean(value['showBorder'])) ||
    (value['borderPresetId'] !== undefined &&
      value['borderPresetId'] !== null &&
      !isString(value['borderPresetId'])) ||
    (value['strokeColor'] !== undefined && !isString(value['strokeColor'])) ||
    (value['strokeWidth'] !== undefined && !isNumber(value['strokeWidth'])) ||
    (value['strokeStyle'] !== undefined && !isBlurStrokeStyle(value['strokeStyle'])) ||
    (value['radius'] !== undefined && !isNumber(value['radius'])) ||
    (value['shadow'] !== undefined && !isNumber(value['shadow'])) ||
    (value['strokeOpacity'] !== undefined && !isNumber(value['strokeOpacity']))
  ) {
    return null;
  }

  return {
    amount: value['amount'],
    blurType: value['blurType'],
    ...(value['borderPresetId'] !== undefined
      ? { borderPresetId: value['borderPresetId'] as string | null }
      : {}),
    ...(value['radius'] !== undefined ? { radius: value['radius'] } : {}),
    ...(value['shadow'] !== undefined ? { shadow: value['shadow'] } : {}),
    showBorder:
      value['showBorder'] ?? (isNumber(value['strokeWidth']) ? value['strokeWidth'] > 0 : false),
    ...(value['strokeColor'] !== undefined ? { strokeColor: value['strokeColor'] } : {}),
    ...(value['strokeOpacity'] !== undefined ? { strokeOpacity: value['strokeOpacity'] } : {}),
    ...(value['strokeStyle'] !== undefined ? { strokeStyle: value['strokeStyle'] } : {}),
    ...(value['strokeWidth'] !== undefined ? { strokeWidth: value['strokeWidth'] } : {}),
  };
}

function parseShapeCorrection(
  value: unknown,
  fallback: EditorBrushSettings['shapeCorrection']
): EditorBrushSettings['shapeCorrection'] | null {
  if (value === 'off' || value === 'subtle' || value === 'strong') {
    return value;
  }

  if (value === undefined) {
    return fallback;
  }

  return null;
}

function resolveLegacyShapeCorrection(
  value: unknown,
  fallback: EditorBrushSettings['shapeCorrection']
): EditorBrushSettings['shapeCorrection'] | null {
  const parsedShapeCorrection = parseShapeCorrection(value, fallback);
  if (parsedShapeCorrection) {
    return parsedShapeCorrection;
  }

  return null;
}

export function parseBrushSettings(
  value: unknown,
  fallback: EditorBrushSettings['shapeCorrection'] = 'subtle'
): EditorBrushSettings | null {
  const shapeCorrection =
    isRecord(value) && value['shapeCorrection'] !== undefined
      ? resolveLegacyShapeCorrection(value['shapeCorrection'], fallback)
      : isRecord(value) && isBoolean(value['recognitionEnabled'])
        ? value['recognitionEnabled']
          ? 'subtle'
          : 'off'
        : fallback;

  return isRecord(value) &&
    isString(value['color']) &&
    isNumber(value['width']) &&
    isNumber(value['opacity']) &&
    isNumber(value['shadow']) &&
    isNumber(value['smoothingLevel']) &&
    shapeCorrection !== null
    ? {
        color: value['color'],
        ...(isBoolean(value['dynamicWidth']) ? { dynamicWidth: value['dynamicWidth'] } : {}),
        width: value['width'],
        opacity: value['opacity'],
        shadow: value['shadow'],
        ...parsePresetShadowSettings(value, value['color']),
        smoothingLevel: value['smoothingLevel'],
        shapeCorrection,
      }
    : null;
}

export function parseShapeSettings(value: unknown): EditorShapeSettings | null {
  return isRecord(value) &&
    isString(value['strokeColor']) &&
    isString(value['fillColor']) &&
    isNumber(value['strokeWidth']) &&
    isNumber(value['opacity']) &&
    isNumber(value['strokeOpacity']) &&
    isNumber(value['fillOpacity']) &&
    (value['borderPresetId'] === null || isString(value['borderPresetId'])) &&
    (value['strokeStyle'] === 'solid' ||
      value['strokeStyle'] === 'dashed' ||
      value['strokeStyle'] === 'dotted') &&
    isNumber(value['radius']) &&
    isNumber(value['shadow']) &&
    isString(value['customCss']) &&
    isBoolean(value['inheritCustomCss'])
    ? {
        strokeColor: value['strokeColor'],
        fillColor: value['fillColor'],
        strokeWidth: value['strokeWidth'],
        opacity: value['opacity'],
        strokeOpacity: value['strokeOpacity'],
        fillOpacity: value['fillOpacity'],
        borderPresetId: value['borderPresetId'],
        strokeStyle: value['strokeStyle'],
        radius: value['radius'],
        shadow: value['shadow'],
        shadowAngle: isNumber(value['shadowAngle']) ? value['shadowAngle'] : 90,
        shadowBlur: isNumber(value['shadowBlur']) ? value['shadowBlur'] : 12,
        shadowColor: isString(value['shadowColor']) ? value['shadowColor'] : value['strokeColor'],
        shadowDistance: isNumber(value['shadowDistance']) ? value['shadowDistance'] : 4,
        customCss: value['customCss'],
        inheritCustomCss: value['inheritCustomCss'],
      }
    : null;
}

export function parseStepSettings(value: unknown): EditorStepSettings | null {
  return isRecord(value) &&
    (value['type'] === 'number' || value['type'] === 'letter' || value['type'] === 'manual') &&
    (value['alphabet'] === 'cyrillic' || value['alphabet'] === 'latin') &&
    isNumber(value['sizeLevel']) &&
    isString(value['value']) &&
    isString(value['color']) &&
    (value['opacity'] === undefined || isNumber(value['opacity'])) &&
    (value['textColor'] === undefined || isString(value['textColor'])) &&
    (value['strokeColor'] === undefined || isString(value['strokeColor'])) &&
    (value['strokeOpacity'] === undefined || isNumber(value['strokeOpacity'])) &&
    (value['strokeWidth'] === undefined || isNumber(value['strokeWidth']))
    ? {
        type: value['type'],
        alphabet: value['alphabet'],
        sizeLevel: value['sizeLevel'] as EditorStepSettings['sizeLevel'],
        value: value['value'],
        color: value['color'],
        opacity: value['opacity'] ?? 1,
        textColor: value['textColor'] ?? '#ffffff',
        strokeColor: value['strokeColor'] ?? '#f8fafc',
        strokeOpacity: value['strokeOpacity'] ?? 1,
        strokeWidth: value['strokeWidth'] ?? 2,
      }
    : null;
}
