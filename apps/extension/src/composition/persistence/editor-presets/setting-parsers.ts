import type { EditorStepSettings } from '../../../features/editor/document/step-types';
import { isNumber, isRecord, isString } from '../infrastructure/guards/primitives';
export { parseSceneBackgroundSettings } from './scene-background-setting-parser';

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
