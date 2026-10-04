// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { SCREENSHOT_MARK_ENTRIES } from '../../../features/editor/document/rich-shape/catalog/entries-screenshot-marks';
import {
  createRichShapeObject,
  exportRichShapeDocumentObject,
  resizeRichShapeObjectToBounds,
} from './index';
import {
  getEditorBuiltInShapeEntry,
  normalizeEditorRichShapeObject,
} from '../../../features/editor/document/rich-shape';
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

it.each(SCREENSHOT_MARK_ENTRIES)(
  'restores $id after placement, resizing and style changes',
  (entry) => {
    const object = createRichShapeCatalogObject({
      entry,
      id: entry.id,
      labelIndex: 1,
      left: 12,
      top: 18,
    });
    expect(object.sniptaleRichShape.style.fillTransparency).toBe(
      entry.insertDefaults.style.fillTransparency
    );
    expect(object.sniptaleRichShape.style.line.width).toBe(3);
    resizeRichShapeObjectToBounds(object, { left: 40, top: 60, width: 96, height: 96 });
    object.set({ angle: 30, opacity: 0.7 });
    const document = exportRichShapeDocumentObject(object);
    const restored = createRichShapeObject(
      normalizeEditorRichShapeObject(JSON.parse(JSON.stringify(document)))
    );
    expect(restored).not.toBeNull();
    expect(restored?.sniptaleRichShape.shapeKind).toBe(entry.id);
    expect(restored?.sniptaleRichShape.frame).toEqual(document.frame);
    expect(restored?.angle).toBe(30);
    expect(restored?.opacity).toBe(0.7);
    expect(restored?.getObjects().length).toBeGreaterThan(0);
  }
);
