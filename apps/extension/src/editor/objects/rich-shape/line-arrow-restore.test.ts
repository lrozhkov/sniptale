// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { createDefaultRichShapeObject } from '../../../features/editor/document/rich-shape';
import { createRichShapeObject } from './object';

it('restores source-less line-arrow documents through the catalog compatibility alias', () => {
  const restored = createRichShapeObject(
    createDefaultRichShapeObject({
      shapeKind: 'line-arrow',
      source: {
        formatVersion: null,
        importedAt: null,
        itemId: null,
        libraryId: null,
        name: null,
        type: 'custom',
      },
    })
  );

  expect(restored).not.toBeNull();
  expect(restored?.getObjects().length).toBeGreaterThan(1);
  expect(restored?.sniptaleRichShapeCatalogId).toBeUndefined();
});
