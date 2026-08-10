import {
  getEditorBuiltInShapeEntry,
  type EditorRichShapeDocumentObject,
} from '../../../../features/editor/document/rich-shape';

export function resolveRichShapeTextFrameGeometry(shape: EditorRichShapeDocumentObject) {
  return (
    shape.geometry ??
    getEditorBuiltInShapeEntry(shape.source?.itemId ?? shape.shapeKind)?.geometry ??
    null
  );
}
