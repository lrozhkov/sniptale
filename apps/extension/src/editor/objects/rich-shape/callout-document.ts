import {
  createDefaultRichShapeCalloutGeometry,
  createDefaultRichShapeObject,
  type EditorRichShapeDocumentObject,
} from '../../../features/editor/document/rich-shape';
import { type EditorToolSettings } from '../../../features/editor/document/tool-settings-types';
import { createCalloutEffects, createCalloutStyle } from './callout-style';
import { createCalloutText } from './callout-text';

export function createRichShapeDocumentObjectFromCallout(options: {
  id: string;
  labelIndex: number;
  left: number;
  height?: number;
  settings: EditorToolSettings['callout'];
  top: number;
  width?: number;
}): EditorRichShapeDocumentObject {
  const baseShape = createDefaultRichShapeObject();
  const width = Math.max(1, options.width ?? 220);
  const height = Math.max(1, options.height ?? 140);
  const frame = { height, left: options.left, top: options.top, width };
  return createDefaultRichShapeObject({
    effects: createCalloutEffects(baseShape, options.settings),
    frame,
    id: options.id,
    shapeFamily: 'callout',
    shapeKind: 'dynamic-callout',
    style: createCalloutStyle(baseShape, options.settings),
    callout: createDefaultRichShapeCalloutGeometry(frame, options.settings.tailSide),
    source: createCalloutSource(),
    text: createCalloutText(baseShape.text, options.settings),
  });
}

function createCalloutSource() {
  return {
    formatVersion: '1',
    importedAt: null,
    itemId: 'dynamic-callout',
    libraryId: null,
    name: 'Выноска',
    type: 'built-in' as const,
  };
}
