// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { getEditorBuiltInShapeEntry } from '../../../features/editor/document/rich-shape';
import {
  createRichShapeCatalogObject,
  createRichShapeDocumentObjectFromCatalog,
} from './catalog-object';

function getEntry(id: string) {
  const entry = getEditorBuiltInShapeEntry(id);
  if (!entry) {
    throw new Error(`Missing catalog entry ${id}`);
  }
  return entry;
}

describe('rich-shape catalog object owner', () => {
  it('applies line arrow defaults and rough style during catalog document creation', () => {
    const shape = createRichShapeDocumentObjectFromCatalog({
      entry: getEntry('double-line-arrow'),
      id: 'double-arrow',
      labelIndex: 1,
      left: 10,
      rough: true,
      top: 20,
    });

    expect(shape.rough.enabled).toBe(true);
    expect(shape.style.fillTransparency).toBe(1);
    expect(shape.style.line.beginArrowhead).toBe('triangle');
    expect(shape.style.line.endArrowhead).toBe('triangle');
  });

  it('creates labeled catalog groups and throws for unsupported geometry', () => {
    const object = createRichShapeCatalogObject({
      entry: getEntry('rectangle'),
      id: 'rect',
      labelIndex: 2,
      left: 0,
      top: 0,
    });

    expect(object.sniptaleLabel).toBe('Прямоугольник 2');
    expect(() =>
      createRichShapeCatalogObject({
        entry: { ...getEntry('rectangle'), geometry: null as never, id: 'broken' },
        id: 'broken',
        labelIndex: 1,
        left: 0,
        top: 0,
      })
    ).toThrow('Unsupported rich shape geometry: broken');
  });
});
