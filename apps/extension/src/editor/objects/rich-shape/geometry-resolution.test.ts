import { describe, expect, it } from 'vitest';
import {
  createDefaultRichShapeObject,
  getEditorBuiltInShapeEntry,
} from '../../../features/editor/document/rich-shape';
import { resolveRichShapeCatalogEntry, resolveRichShapeGeometry } from './geometry-resolution';

describe('rich-shape geometry resolution', () => {
  it('resolves source ids before shape kinds and supports compatibility aliases', () => {
    const shape = createDefaultRichShapeObject({
      shapeKind: 'line-arrow',
      source: {
        formatVersion: null,
        importedAt: null,
        itemId: null,
        libraryId: null,
        name: null,
        type: 'custom',
      },
    });

    expect(resolveRichShapeCatalogEntry(shape)?.id).toBe('arrow');
    expect(resolveRichShapeGeometry(shape)).toBe(getEditorBuiltInShapeEntry('arrow')?.geometry);
  });

  it('uses explicit fallback geometry before embedded or catalog geometry', () => {
    const fallback = {
      paths: [{ commands: [['M', 0, 0], ['L', 10, 10], ['Z']] }],
      type: 'path' as const,
      viewBox: { height: 10, minX: 0, minY: 0, width: 10 },
    } as const;
    const shape = createDefaultRichShapeObject({ shapeKind: 'rectangle' });

    expect(resolveRichShapeGeometry(shape, fallback)).toBe(fallback);
  });
});
