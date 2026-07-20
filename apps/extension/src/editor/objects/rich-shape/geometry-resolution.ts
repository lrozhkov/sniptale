import {
  createRichShapeCalloutGeometry,
  getEditorBuiltInShapeEntry,
  type EditorBuiltInShapeCatalogEntry,
  type EditorBuiltInShapeGeometryDefinition,
  type EditorRichShapeDocumentObject,
} from '../../../features/editor/document/rich-shape';

export function resolveRichShapeCatalogEntry(
  shape: EditorRichShapeDocumentObject
): EditorBuiltInShapeCatalogEntry | undefined {
  const sourceId = shape.source?.itemId;
  if (sourceId) {
    return getEditorBuiltInShapeEntry(sourceId);
  }

  return getEditorBuiltInShapeEntry(shape.shapeKind);
}

export function resolveRichShapeGeometry(
  shape: EditorRichShapeDocumentObject,
  fallback?: EditorBuiltInShapeGeometryDefinition
): EditorBuiltInShapeGeometryDefinition | null {
  return (
    createRichShapeCalloutGeometry(shape) ??
    fallback ??
    shape.geometry ??
    resolveRichShapeCatalogEntry(shape)?.geometry ??
    null
  );
}
