// @vitest-environment jsdom

import { expect, it, vi } from 'vitest';
import {
  createDefaultRichShapeObject,
  getEditorBuiltInShapeEntry,
} from '../../../features/editor/document/rich-shape';
import {
  createRichShapeCatalogObject,
  createRichShapeObject,
  exportRichShapeDocumentObject,
  getRichShapeTextCapability,
  isRichShapeObject,
  applyRichShapeDocumentObjectToObject,
} from './';
import { replaceRichShapeGroupObjects } from './group-objects';

const geometry = {
  paths: [{ commands: [['M', 0, 0], ['L', 24, 12], ['Z']] }],
  type: 'path',
  viewBox: { height: 12, minX: 0, minY: 0, width: 24 },
} as const;

function getEntry(id: string) {
  const entry = getEditorBuiltInShapeEntry(id);
  if (!entry) {
    throw new Error(`Missing catalog entry ${id}`);
  }
  return entry;
}

it('restores custom rich shapes from embedded document geometry', () => {
  const object = createRichShapeObject(
    createDefaultRichShapeObject({
      frame: { height: 12, left: 4, top: 6, width: 24 },
      geometry,
      shapeFamily: 'custom',
      shapeKind: 'custom-badge',
      source: {
        formatVersion: '1',
        importedAt: '2026-05-17T00:00:00.000Z',
        itemId: 'custom-badge',
        libraryId: null,
        name: 'Badge',
        type: 'custom',
      },
    })
  );

  expect(object).not.toBeNull();
  if (!object) {
    return;
  }
  expect(object.sniptaleRichShape.geometry).toEqual(geometry);
  expect(exportRichShapeDocumentObject(object).geometry).toEqual(geometry);
});

it('restores document shapes from explicit geometry or shape kind catalog fallback', () => {
  const customObject = createRichShapeObject(
    createDefaultRichShapeObject({
      shapeFamily: 'custom',
      shapeKind: 'custom-explicit',
      source: {
        formatVersion: null,
        importedAt: null,
        itemId: null,
        libraryId: null,
        name: null,
        type: 'custom',
      },
    }),
    geometry
  );
  const builtInObject = createRichShapeObject(
    createDefaultRichShapeObject({
      shapeKind: 'rectangle',
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

  expect(customObject).not.toBeNull();
  expect(customObject?.sniptaleRichShape.geometry).toBeUndefined();
  expect(builtInObject).not.toBeNull();
  expect(builtInObject?.sniptaleRichShapeCatalogId).toBeUndefined();
});

it('creates catalog rich shapes with line defaults, rough style, and text capability metadata', () => {
  const arrow = createRichShapeCatalogObject({
    entry: getEntry('arrow'),
    id: 'arrow-rich',
    labelIndex: 1,
    left: 12,
    rough: true,
    top: 18,
  });
  const doubleArrow = createRichShapeCatalogObject({
    entry: getEntry('double-line-arrow'),
    id: 'double-arrow-rich',
    labelIndex: 2,
    left: 20,
    top: 24,
  });
  const rectangle = createRichShapeCatalogObject({
    entry: getEntry('rectangle'),
    id: 'rectangle-rich',
    labelIndex: 3,
    left: 0,
    top: 0,
  });

  expect(isRichShapeObject(arrow)).toBe(true);
  expect(arrow.sniptaleRichShapeCatalogId).toBe('arrow');
  expect(arrow.sniptaleRichShape.rough.enabled).toBe(true);
  expect(arrow.sniptaleRichShape.style.line.endArrowhead).toBe('triangle');
  expect(doubleArrow.sniptaleRichShape.style.line.beginArrowhead).toBe('triangle');
  expect(doubleArrow.sniptaleRichShape.style.line.endArrowhead).toBe('triangle');
  expect(getRichShapeTextCapability(arrow)).toBe(false);
  expect(getRichShapeTextCapability(rectangle)).toBe(true);
  expect(getRichShapeTextCapability({ sniptaleType: 'rectangle' } as never)).toBe(false);
});

it('exports rich shape Fabric fallback values when runtime fields are cleared', () => {
  const shape = createDefaultRichShapeObject({
    frame: { height: 12, left: 4, top: 6, width: 24 },
    geometry,
  });
  delete shape.source;
  const object = createRichShapeObject(shape);
  expect(object).not.toBeNull();
  if (!object) {
    return;
  }

  object.set({
    angle: undefined,
    height: undefined,
    left: undefined,
    opacity: undefined,
    scaleX: undefined,
    scaleY: undefined,
    top: undefined,
    width: undefined,
  });
  delete object.sniptaleId;
  delete object.sniptaleLabel;

  const exported = exportRichShapeDocumentObject(object);

  expect(exported.id).toBe(object.sniptaleRichShape.id);
  expect(exported.frame).toEqual(object.sniptaleRichShape.frame);
  expect(exported.source).toBeUndefined();
});

it('replaces group children when applying a resized rich shape document object', () => {
  const object = createRichShapeObject(
    createDefaultRichShapeObject({
      frame: { height: 12, left: 4, top: 6, width: 24 },
      geometry,
    })
  );
  expect(object).not.toBeNull();
  if (!object) {
    return;
  }

  expect(
    applyRichShapeDocumentObjectToObject(object, {
      ...object.sniptaleRichShape,
      frame: { height: 24, left: 10, top: 12, width: 48 },
    })
  ).toBe(true);
  expect(object.getObjects().length).toBeGreaterThan(0);
  expect(object.width).toBe(48);
});

it('initializes empty rich shape groups with newly projected local children', () => {
  const group = {
    _objects: [],
    enterGroup: vi.fn(),
    getObjects: vi.fn(() => []),
    remove: vi.fn(),
    set: vi.fn(),
  };
  const shape = createDefaultRichShapeObject({ frame: { height: 12, left: 0, top: 0, width: 24 } });

  replaceRichShapeGroupObjects(group as never, shape, geometry);

  expect(group.remove).not.toHaveBeenCalled();
  expect(group._objects.length).toBeGreaterThan(0);
  expect(group.enterGroup).toHaveBeenCalled();
  expect(group.set).toHaveBeenCalledWith({ dirty: true, height: 12, width: 24 });
});
