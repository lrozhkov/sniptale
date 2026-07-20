import { DEFAULT_RICH_SHAPE_SOURCE } from './defaults';
import type { EditorRichShapeSourceMetadata } from './types';
import { isRecord, nullableStringOr, oneOfOr } from './values';

const SOURCE_TYPES: readonly EditorRichShapeSourceMetadata['type'][] = [
  'built-in',
  'custom',
  'manual-excalidraw-import',
  'excalidraw-library',
  'excalidraw-export',
  'unknown',
];

export function normalizeSource(value: unknown): EditorRichShapeSourceMetadata {
  const source = isRecord(value) ? value : {};
  const type = oneOfOr(source['type'], SOURCE_TYPES, DEFAULT_RICH_SHAPE_SOURCE.type);
  return {
    type,
    name: nullableStringOr(source['name'], DEFAULT_RICH_SHAPE_SOURCE.name),
    libraryId: nullableStringOr(source['libraryId'], DEFAULT_RICH_SHAPE_SOURCE.libraryId),
    itemId: nullableStringOr(source['itemId'], DEFAULT_RICH_SHAPE_SOURCE.itemId),
    importedAt: nullableStringOr(source['importedAt'], DEFAULT_RICH_SHAPE_SOURCE.importedAt),
    formatVersion: nullableStringOr(
      source['formatVersion'],
      DEFAULT_RICH_SHAPE_SOURCE.formatVersion
    ),
  };
}
