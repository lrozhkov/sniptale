import {
  getEditorBuiltInShapeEntry,
  type EditorBuiltInShapeCapability,
  type EditorRichShapeDocumentObject,
} from '../../../../features/editor/document/rich-shape';

const DEFAULT_RICH_SHAPE_CAPABILITIES: readonly EditorBuiltInShapeCapability[] = [
  'fill',
  'line',
  'text',
  'effects',
];

const CUSTOM_GEOMETRY_CAPABILITIES: readonly EditorBuiltInShapeCapability[] = [
  'fill',
  'line',
  'effects',
];

const LINE_CAPABILITIES: readonly EditorBuiltInShapeCapability[] = ['line', 'connectors'];

export function resolveRichShapeCapabilities(
  shape: EditorRichShapeDocumentObject
): readonly EditorBuiltInShapeCapability[] {
  const entry = getEditorBuiltInShapeEntry(shape.source?.itemId ?? shape.shapeKind);
  if (entry) {
    return entry.capabilities;
  }

  if (shape.shapeFamily === 'line' || shape.shapeFamily === 'connector') {
    return LINE_CAPABILITIES;
  }

  if (shape.shapeFamily === 'custom') {
    return CUSTOM_GEOMETRY_CAPABILITIES;
  }

  return DEFAULT_RICH_SHAPE_CAPABILITIES;
}

export function canUseRichShapeRoughControls(shape: EditorRichShapeDocumentObject): boolean {
  const entry = getEditorBuiltInShapeEntry(shape.source?.itemId ?? shape.shapeKind);
  return Boolean(shape.geometry || entry);
}
