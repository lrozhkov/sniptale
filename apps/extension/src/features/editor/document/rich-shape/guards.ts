import {
  isBoolean,
  isNumber,
  isRecord,
  isString,
} from '@sniptale/runtime-contracts/validation/primitives';
import { normalizeRichShapeCalloutGeometry } from './callout';
import { isEditorRichShapeFamily } from './catalog/families';
import { parseEditorCustomShapeGeometry } from './custom';
import { EDITOR_RICH_SHAPE_OBJECT_TYPE } from './types';
import type { EditorRichShapeDocumentObject, EditorRichShapeFrame } from './types';

function isFrame(value: unknown): boolean {
  return (
    isRecord(value) &&
    isNumber(value['left']) &&
    isNumber(value['top']) &&
    isNumber(value['width']) &&
    isNumber(value['height'])
  );
}

function isLineStyle(value: unknown): boolean {
  return (
    isRecord(value) &&
    isString(value['color']) &&
    isNumber(value['transparency']) &&
    isNumber(value['width']) &&
    isString(value['dashStyle']) &&
    isString(value['cap']) &&
    isString(value['join']) &&
    isString(value['beginArrowhead']) &&
    isString(value['endArrowhead'])
  );
}

function isFill(value: unknown): boolean {
  return isRecord(value) && isString(value['type']);
}

function isStyle(value: unknown): boolean {
  return (
    isRecord(value) &&
    isFill(value['fill']) &&
    isNumber(value['fillTransparency']) &&
    isLineStyle(value['line']) &&
    isNumber(value['opacity']) &&
    isNumber(value['cornerRadius'])
  );
}

function isEffects(value: unknown): boolean {
  return (
    isRecord(value) &&
    isRecord(value['shadow']) &&
    isBoolean(value['shadow']['enabled']) &&
    isRecord(value['reflection']) &&
    isBoolean(value['reflection']['enabled']) &&
    isRecord(value['glow']) &&
    isBoolean(value['glow']['enabled']) &&
    isRecord(value['softEdge']) &&
    isBoolean(value['softEdge']['enabled'])
  );
}

function isText(value: unknown): boolean {
  return (
    isRecord(value) &&
    isString(value['content']) &&
    isString(value['fontFamily']) &&
    isNumber(value['fontSize']) &&
    isRecord(value['insets'])
  );
}

function isRough(value: unknown): boolean {
  return (
    isRecord(value) &&
    isBoolean(value['enabled']) &&
    (value['seed'] === null || isNumber(value['seed'])) &&
    isNumber(value['roughness']) &&
    isNumber(value['bowing']) &&
    isString(value['fillStyle']) &&
    (value['fillColor'] === undefined || isString(value['fillColor'])) &&
    isNumber(value['hachureGap']) &&
    isNumber(value['hachureAngle']) &&
    isNumber(value['fillWeight']) &&
    isNumber(value['fillRoughness']) &&
    isNumber(value['fillBowing']) &&
    isNumber(value['fillTransparency']) &&
    isBoolean(value['preserveVertices'])
  );
}

function isLayer(value: unknown): boolean {
  return (
    isRecord(value) &&
    isBoolean(value['visible']) &&
    isBoolean(value['locked']) &&
    (value['zIndex'] === null || isNumber(value['zIndex']))
  );
}

function isSource(value: unknown): boolean {
  return value === undefined || (isRecord(value) && isString(value['type']));
}

function isGeometry(value: unknown): boolean {
  return value === undefined || parseEditorCustomShapeGeometry(value) !== null;
}

function isCallout(value: unknown, frame: unknown): boolean {
  return (
    value === undefined ||
    (isFrame(frame) &&
      normalizeRichShapeCalloutGeometry(value, frame as EditorRichShapeFrame) !== undefined)
  );
}

export function isEditorRichShapeDocumentObject(
  value: unknown
): value is EditorRichShapeDocumentObject {
  return (
    isRecord(value) &&
    isString(value['id']) &&
    value['objectType'] === EDITOR_RICH_SHAPE_OBJECT_TYPE &&
    isEditorRichShapeFamily(value['shapeFamily']) &&
    isString(value['shapeKind']) &&
    isFrame(value['frame']) &&
    isNumber(value['rotation']) &&
    isNumber(value['scaleX']) &&
    isNumber(value['scaleY']) &&
    isStyle(value['style']) &&
    isEffects(value['effects']) &&
    isText(value['text']) &&
    isRough(value['rough']) &&
    isGeometry(value['geometry']) &&
    isCallout(value['callout'], value['frame']) &&
    isSource(value['source']) &&
    isLayer(value['layer'])
  );
}

export function isEditorRichShapeDocumentObjectArray(
  value: unknown
): value is EditorRichShapeDocumentObject[] {
  return Array.isArray(value) && value.every(isEditorRichShapeDocumentObject);
}
