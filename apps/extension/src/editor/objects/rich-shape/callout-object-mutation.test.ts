// @vitest-environment jsdom

import { expect, it } from 'vitest';
import {
  createDefaultRichShapeObject,
  getEditorBuiltInShapeEntry,
} from '../../../features/editor/document/rich-shape';
import {
  createRichShapeCatalogObject,
  createRichShapeObject,
  getRichShapeTextCapability,
  isRichShapeObject,
  normalizeScaledRichShapeObject,
  updateRichShapeObjectStyle,
} from './';

function getEntry(id: string) {
  const entry = getEditorBuiltInShapeEntry(id);
  if (!entry) {
    throw new Error(`Missing catalog entry ${id}`);
  }
  return entry;
}

it('keeps catalog creation and rich-shape capability branches intact', () => {
  const arrow = createRichShapeCatalogObject({
    entry: getEntry('arrow'),
    id: 'arrow-callout-proof',
    labelIndex: 1,
    left: 0,
    rough: true,
    top: 0,
  });
  const leftArrow = createRichShapeCatalogObject({
    entry: getEntry('left-line-arrow'),
    id: 'left-arrow-callout-proof',
    labelIndex: 2,
    left: 0,
    top: 0,
  });
  const doubleArrow = createRichShapeCatalogObject({
    entry: getEntry('double-line-arrow'),
    id: 'double-arrow-callout-proof',
    labelIndex: 3,
    left: 0,
    top: 0,
  });
  const rectangle = createRichShapeCatalogObject({
    entry: getEntry('rectangle'),
    height: 64,
    id: 'rectangle-callout-proof',
    labelIndex: 4,
    left: 10,
    top: 12,
    width: 96,
  });

  expect(isRichShapeObject(arrow)).toBe(true);
  expect(arrow.sniptaleRichShape.rough.enabled).toBe(true);
  expect(arrow.sniptaleRichShape.style.line.endArrowhead).toBe('triangle');
  expect(leftArrow.sniptaleRichShape.style.line.beginArrowhead).toBe('triangle');
  expect(doubleArrow.sniptaleRichShape.style.line.beginArrowhead).toBe('triangle');
  expect(doubleArrow.sniptaleRichShape.style.line.endArrowhead).toBe('triangle');
  expect(rectangle.sniptaleRichShape.frame).toEqual({
    height: 64,
    left: 10,
    top: 12,
    width: 96,
  });
  expect(getRichShapeTextCapability(arrow)).toBe(false);
  expect(getRichShapeTextCapability(rectangle)).toBe(true);
  expect(getRichShapeTextCapability({ sniptaleType: 'rectangle' } as never)).toBe(false);
});

it('rejects unsupported rich shape catalog geometry', () => {
  expect(() =>
    createRichShapeCatalogObject({
      entry: {
        ...getEntry('rectangle'),
        geometry: null as never,
        id: 'unsupported-catalog-callout-proof',
        insertDefaults: {
          ...getEntry('rectangle').insertDefaults,
          shapeKind: 'unsupported-catalog-callout-proof',
        },
      },
      id: 'unsupported-catalog-callout-proof',
      labelIndex: 5,
      left: 0,
      top: 0,
    })
  ).toThrow('Unsupported rich shape geometry');
});

function createSelectionStyleUpdate() {
  return {
    arrow: {
      color: '#ff0000',
      endHead: 'diamond',
      mode: 'straight',
      opacity: 0.7,
      shadow: 0,
      startHead: 'none',
      variant: 'standard',
      width: 8,
    },
    rectangle: {
      borderPresetId: null,
      customCss: '',
      fillColor: '#00ff00',
      fillOpacity: 0.35,
      inheritCustomCss: false,
      opacity: 1,
      radius: 10,
      shadow: 0,
      strokeColor: '#0000ff',
      strokeOpacity: 0.8,
      strokeStyle: 'dashed',
      strokeWidth: 5,
    },
  } as const;
}

it('normalizes scale and applies selection style updates through the mutation seam', () => {
  const geometry = {
    paths: [{ commands: [['M', 0, 0], ['L', 80, 40], ['Z']] }],
    type: 'path',
    viewBox: { height: 40, minX: 0, minY: 0, width: 80 },
  } as const;
  const object = createRichShapeObject(
    createDefaultRichShapeObject({
      frame: { height: 40, left: 2, top: 4, width: 80 },
      geometry,
      shapeKind: 'custom-scale-proof',
    })
  );

  if (!object) {
    throw new Error('Expected rich shape object');
  }

  object.set({ height: undefined, scaleX: 2, scaleY: 0, width: undefined });

  expect(normalizeScaledRichShapeObject(object)).toBe(true);
  expect(object.sniptaleRichShape.frame).toEqual({ height: 1, left: 2, top: 4, width: 160 });
  expect(normalizeScaledRichShapeObject(object)).toBe(false);
  expect(updateRichShapeObjectStyle(object, createSelectionStyleUpdate() as never)).toBe(true);
  expect(object.sniptaleRichShape.style.line.dashStyle).toBe('dash');
  expect(updateRichShapeObjectStyle({ sniptaleType: 'rectangle' } as never, {} as never)).toBe(
    false
  );
});
