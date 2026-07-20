export {
  EDITOR_RICH_SHAPE_FAMILY,
  EDITOR_RICH_SHAPE_KINDS_BY_FAMILY,
  isEditorKnownRichShapeKind,
  isEditorRichShapeFamily,
  resolveEditorRichShapeFamily,
} from './families';
export type { EditorKnownRichShapeKind, EditorRichShapeFamily } from './families';
export { EDITOR_BUILT_IN_SHAPE_CATALOG, PRIMARY_BUILT_IN_SHAPE_IDS } from './entries';
export type { EditorBuiltInShapeId, EditorPrimaryBuiltInShapeId } from './entries';
export { EDITOR_BUILT_IN_SHAPE_CATEGORY } from './types';
export type {
  EditorBuiltInShapeCapability,
  EditorBuiltInShapeCatalogEntry,
  EditorBuiltInShapeCategory,
  EditorBuiltInShapeGeometryDefinition,
  EditorBuiltInShapeInsertDefaults,
  EditorBuiltInShapePathCommand,
  EditorBuiltInShapePathGeometry,
  EditorBuiltInShapePathPrimitive,
  EditorBuiltInShapePolylineGeometry,
  EditorBuiltInShapeTextFrame,
  EditorBuiltInShapeViewBox,
} from './types';

import { EDITOR_BUILT_IN_SHAPE_CATALOG } from './entries';
import type {
  EditorBuiltInShapeCatalogEntry,
  EditorBuiltInShapeGeometryDefinition,
  EditorBuiltInShapeTextFrame,
  EditorBuiltInShapeViewBox,
} from './types';

const ENTRY_BY_ID = new Map(EDITOR_BUILT_IN_SHAPE_CATALOG.map((entry) => [entry.id, entry]));
const ENTRY_BY_COMPATIBILITY_ID = new Map(
  EDITOR_BUILT_IN_SHAPE_CATALOG.flatMap((entry) =>
    (entry.compatibilityIds ?? []).map((compatibilityId) => [compatibilityId, entry] as const)
  )
);

function normalizeSearchToken(value: string): string {
  return value.trim().toLocaleLowerCase('ru-RU').replace(/\s+/g, ' ');
}

function getSearchHaystack(entry: EditorBuiltInShapeCatalogEntry): string {
  return [
    entry.id,
    entry.labelFallback,
    entry.category,
    entry.insertDefaults.shapeKind,
    ...entry.tags,
    ...entry.searchAliases,
    ...(entry.compatibilityIds ?? []),
  ]
    .map(normalizeSearchToken)
    .join(' ');
}

export function getEditorBuiltInShapeEntry(id: string): EditorBuiltInShapeCatalogEntry | undefined {
  return ENTRY_BY_ID.get(id) ?? ENTRY_BY_COMPATIBILITY_ID.get(id);
}

export function searchEditorBuiltInShapes(query: string): EditorBuiltInShapeCatalogEntry[] {
  const normalizedQuery = normalizeSearchToken(query);
  if (!normalizedQuery) {
    return [...EDITOR_BUILT_IN_SHAPE_CATALOG];
  }

  return EDITOR_BUILT_IN_SHAPE_CATALOG.filter((entry) =>
    getSearchHaystack(entry).includes(normalizedQuery)
  );
}

function isValidTextFrame(
  textFrame: EditorBuiltInShapeTextFrame | undefined,
  viewBox: EditorBuiltInShapeViewBox
): boolean {
  if (!textFrame) {
    return true;
  }

  const right = textFrame.left + textFrame.width;
  const bottom = textFrame.top + textFrame.height;
  return (
    Number.isFinite(textFrame.left) &&
    Number.isFinite(textFrame.top) &&
    Number.isFinite(textFrame.width) &&
    Number.isFinite(textFrame.height) &&
    textFrame.width > 0 &&
    textFrame.height > 0 &&
    textFrame.left >= viewBox.minX &&
    textFrame.top >= viewBox.minY &&
    right <= viewBox.minX + viewBox.width &&
    bottom <= viewBox.minY + viewBox.height
  );
}

export function isValidEditorBuiltInShapeGeometry(
  geometry: EditorBuiltInShapeGeometryDefinition
): boolean {
  const validViewBox =
    Number.isFinite(geometry.viewBox.width) &&
    Number.isFinite(geometry.viewBox.height) &&
    geometry.viewBox.width > 0 &&
    geometry.viewBox.height > 0;

  if (!validViewBox) {
    return false;
  }

  if (!isValidTextFrame(geometry.textFrame, geometry.viewBox)) {
    return false;
  }

  if (geometry.type === 'polyline') {
    return geometry.points.length >= 2 && geometry.points.every((point) => point.length === 2);
  }

  return geometry.paths.length > 0 && geometry.paths.every((item) => item.commands.length > 0);
}
