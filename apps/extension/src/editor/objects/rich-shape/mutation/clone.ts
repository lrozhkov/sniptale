import type { EditorRichShapeDocumentObject } from '../../../../features/editor/document/rich-shape';

export function cloneRichShape(
  shape: EditorRichShapeDocumentObject
): EditorRichShapeDocumentObject {
  return structuredClone(shape);
}
