// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createRichShapeCatalogObject } from './catalog-object';
import { getRichShapeTextCapability, isRichShapeObject } from './guards';
import { getEditorBuiltInShapeEntry } from '../../../features/editor/document/rich-shape';

function getEntry(id: string) {
  const entry = getEditorBuiltInShapeEntry(id);
  if (!entry) {
    throw new Error(`Missing catalog entry ${id}`);
  }
  return entry;
}

describe('rich-shape guards', () => {
  it('narrows rich shapes and resolves text capability from catalog metadata', () => {
    const rectangle = createRichShapeCatalogObject({
      entry: getEntry('rectangle'),
      id: 'rect',
      labelIndex: 1,
      left: 0,
      top: 0,
    });
    const line = createRichShapeCatalogObject({
      entry: getEntry('line'),
      id: 'line',
      labelIndex: 1,
      left: 0,
      top: 0,
    });

    expect(isRichShapeObject(rectangle)).toBe(true);
    expect(getRichShapeTextCapability(rectangle)).toBe(true);
    expect(getRichShapeTextCapability(line)).toBe(false);
    expect(isRichShapeObject({ sniptaleType: 'rectangle' } as never)).toBe(false);
  });
});
