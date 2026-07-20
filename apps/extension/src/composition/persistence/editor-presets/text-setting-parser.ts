import type { EditorTextSettings } from '../../../features/editor/document/types';
import { isBoolean, isNumber, isRecord, isString } from '../infrastructure/guards/primitives';

function isTextCalloutFormat(value: unknown): value is EditorTextSettings['calloutFormat'] {
  return (
    value === 'plain' ||
    value === 'panel' ||
    value === 'bubble' ||
    value === 'arrow-bubble' ||
    value === 'pointer' ||
    value === 'flag'
  );
}

function isFontFamily(value: unknown): value is EditorTextSettings['fontFamily'] {
  return value === 'sans' || value === 'serif' || value === 'mono';
}

function isFontWeight(value: unknown): value is EditorTextSettings['fontWeight'] {
  return value === 'normal' || value === 'bold';
}

function isFontStyle(value: unknown): value is EditorTextSettings['fontStyle'] {
  return value === 'normal' || value === 'italic';
}

export function parseTextSettings(value: unknown): EditorTextSettings | null {
  if (
    !isRecord(value) ||
    !isTextCalloutFormat(value['calloutFormat']) ||
    !isFontFamily(value['fontFamily']) ||
    !isNumber(value['fontSize']) ||
    !isFontWeight(value['fontWeight']) ||
    !isFontStyle(value['fontStyle']) ||
    !isBoolean(value['underline']) ||
    !isBoolean(value['linethrough']) ||
    !isString(value['textColor']) ||
    !isString(value['backgroundColor']) ||
    !isNumber(value['backgroundOpacity']) ||
    !isNumber(value['shadow']) ||
    !isNumber(value['tailSize'])
  ) {
    return null;
  }

  return {
    calloutFormat: value['calloutFormat'],
    layoutMode: value['layoutMode'] === 'auto' ? 'auto' : 'fixed-width',
    textAlign:
      value['textAlign'] === 'center' || value['textAlign'] === 'right'
        ? value['textAlign']
        : 'left',
    verticalAlign:
      value['verticalAlign'] === 'center' || value['verticalAlign'] === 'bottom'
        ? value['verticalAlign']
        : 'top',
    fontFamily: value['fontFamily'],
    fontSize: value['fontSize'],
    fontWeight: value['fontWeight'],
    fontStyle: value['fontStyle'],
    underline: value['underline'],
    linethrough: value['linethrough'],
    textColor: value['textColor'],
    textOpacity: isNumber(value['textOpacity']) ? value['textOpacity'] : 1,
    backgroundColor: value['backgroundColor'],
    backgroundOpacity: value['backgroundOpacity'],
    shadow: value['shadow'],
    shadowAngle: isNumber(value['shadowAngle']) ? value['shadowAngle'] : 90,
    shadowBlur: isNumber(value['shadowBlur']) ? value['shadowBlur'] : 12,
    shadowColor: isString(value['shadowColor']) ? value['shadowColor'] : value['textColor'],
    shadowDistance: isNumber(value['shadowDistance']) ? value['shadowDistance'] : 4,
    tailSize: value['tailSize'],
  };
}
