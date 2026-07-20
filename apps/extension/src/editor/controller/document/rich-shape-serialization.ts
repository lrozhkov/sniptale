import type { Canvas } from 'fabric';
import type { EditorDocument } from '../../../features/editor/document/types';
import { exportRichShapeDocumentObject } from '../../objects/rich-shape/object';
import { isRichShapeObject } from '../../objects/rich-shape/guards';

export function collectRichShapeDocumentObjects(
  canvas: Canvas | null
): NonNullable<EditorDocument['richShapes']> {
  if (!canvas) {
    return [];
  }

  return canvas.getObjects().filter(isRichShapeObject).map(exportRichShapeDocumentObject);
}
