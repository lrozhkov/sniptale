import {
  EDITOR_RICH_SHAPE_FAMILY,
  isEditorRichShapeFamily,
  resolveEditorRichShapeFamily,
} from './catalog/families';
import {
  createDefaultRichShapeCalloutGeometry,
  normalizeRichShapeCalloutGeometry,
} from './callout';
import { normalizeEffects } from './effects';
import { normalizeFrame } from './frame';
import { normalizeLayer } from './layer';
import { normalizeRough } from './rough';
import { normalizeSource } from './source';
import { normalizeStyle } from './style';
import { normalizeText } from './text';
import { EDITOR_RICH_SHAPE_OBJECT_TYPE } from './types';
import { parseEditorCustomShapeGeometry } from './custom';
import type { EditorRichShapeDocumentObject } from './types';
import { isRecord, numberOr, stringOr } from './values';

export function normalizeEditorRichShapeObject(value: unknown): EditorRichShapeDocumentObject {
  const shape = isRecord(value) ? value : {};
  const shapeKind = stringOr(shape['shapeKind'], 'custom-shape');
  const family = isEditorRichShapeFamily(shape['shapeFamily'])
    ? shape['shapeFamily']
    : resolveEditorRichShapeFamily(shapeKind, EDITOR_RICH_SHAPE_FAMILY.CUSTOM);

  const geometry = parseEditorCustomShapeGeometry(shape['geometry']);
  const frame = normalizeFrame(shape['frame']);
  const normalizedCallout = normalizeRichShapeCalloutGeometry(shape['callout'], frame);
  const callout =
    normalizedCallout ??
    (shapeKind === 'dynamic-callout' ? createDefaultRichShapeCalloutGeometry(frame) : undefined);
  const style = normalizeStyle(shape['style']);
  const roughSource = isRecord(shape['rough']) ? shape['rough'] : {};
  const roughFillColor =
    roughSource['fillColor'] === undefined && style.fill.type === 'solid'
      ? { fillColor: style.fill.color }
      : {};
  const roughInput =
    roughSource['fillTransparency'] === undefined && roughSource['enabled'] === true
      ? { ...roughSource, ...roughFillColor, fillTransparency: style.fillTransparency }
      : { ...roughSource, ...roughFillColor };
  const rough = normalizeRough(roughInput);
  return {
    id: stringOr(shape['id'], ''),
    objectType: EDITOR_RICH_SHAPE_OBJECT_TYPE,
    shapeFamily: family,
    shapeKind,
    frame,
    rotation: numberOr(shape['rotation'], 0),
    scaleX: numberOr(shape['scaleX'], 1),
    scaleY: numberOr(shape['scaleY'], 1),
    style,
    effects: normalizeEffects(shape['effects']),
    text: normalizeText(shape['text']),
    rough,
    ...(geometry ? { geometry } : {}),
    ...(callout ? { callout } : {}),
    source: normalizeSource(shape['source']),
    layer: normalizeLayer(shape['layer']),
  };
}

export function normalizeEditorDocumentRichShapes(value: unknown): EditorRichShapeDocumentObject[] {
  return Array.isArray(value) ? value.map(normalizeEditorRichShapeObject) : [];
}
