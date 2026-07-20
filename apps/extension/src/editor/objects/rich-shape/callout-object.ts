import type { EditorToolSettings } from '../../../features/editor/document/tool-settings-types';
import { createRichShapeDocumentObjectFromCallout } from './callout-document';
import { createRichShapeObject } from './object';
import type { RichShapeGroup } from './types';

export function createRichShapeCalloutObject(options: {
  id: string;
  labelIndex: number;
  left: number;
  height?: number;
  settings: EditorToolSettings['callout'];
  top: number;
  width?: number;
}): RichShapeGroup {
  const shape = createRichShapeDocumentObjectFromCallout(options);
  const label = `Выноска ${options.labelIndex}`;
  const object = createRichShapeObject(shape, undefined, label);
  if (!object) {
    throw new Error(`Unsupported rich shape geometry: ${shape.shapeKind}`);
  }
  return object;
}
