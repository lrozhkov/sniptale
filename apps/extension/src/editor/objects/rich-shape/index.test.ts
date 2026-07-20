// @vitest-environment jsdom

import { expect, it } from 'vitest';
import {
  createDefaultRichShapeObject,
  EDITOR_BUILT_IN_SHAPE_CATEGORY,
  getEditorBuiltInShapeEntry,
  type EditorBuiltInShapeCategory,
} from '../../../features/editor/document/rich-shape';
import {
  createRichShapeCatalogObject,
  createRichShapeObject,
  exportRichShapeDocumentObject,
  getRichShapeTextCapability,
  isRichShapeObject,
  applyRichShapeDocumentObjectToObject,
  updateRichShapeObjectStyle,
} from './';

const REPRESENTATIVE_BY_CATEGORY = {
  [EDITOR_BUILT_IN_SHAPE_CATEGORY.LINES]: 'arrow',
  [EDITOR_BUILT_IN_SHAPE_CATEGORY.BASIC]: 'oval',
  [EDITOR_BUILT_IN_SHAPE_CATEGORY.BLOCK_ARROWS]: 'block-arrow',
  [EDITOR_BUILT_IN_SHAPE_CATEGORY.EQUATION]: 'math-plus',
  [EDITOR_BUILT_IN_SHAPE_CATEGORY.FLOWCHART]: 'flowchart-decision',
  [EDITOR_BUILT_IN_SHAPE_CATEGORY.CALLOUTS]: 'rect-callout',
  [EDITOR_BUILT_IN_SHAPE_CATEGORY.STARS_BANNERS]: 'star-5',
  [EDITOR_BUILT_IN_SHAPE_CATEGORY.ACTION_BUTTONS]: 'action-button-home',
} satisfies Partial<Record<EditorBuiltInShapeCategory, string>>;

function getEntry(id: string) {
  const entry = getEditorBuiltInShapeEntry(id);
  if (!entry) {
    throw new Error(`Missing catalog entry ${id}`);
  }
  return entry;
}

function createCatalogObject(shapeId: string, id = shapeId, left = 0, top = 0) {
  return createRichShapeCatalogObject({
    entry: getEntry(shapeId),
    id,
    labelIndex: 1,
    left,
    top,
  });
}

it('renders representative catalog categories as selectable rich shape groups', () => {
  Object.values(REPRESENTATIVE_BY_CATEGORY).forEach((shapeId, index) => {
    const object = createRichShapeCatalogObject({
      entry: getEntry(shapeId),
      id: `shape-${index}`,
      labelIndex: index + 1,
      left: 40,
      top: 50,
    });

    expect(isRichShapeObject(object)).toBe(true);
    expect(object.sniptaleType).toBe('rich-shape');
    expect(object.sniptaleRichShapeCatalogId).toBe(shapeId);
    expect(object.getObjects().length).toBeGreaterThan(1);
    expect(object.sniptaleRichShape.source?.itemId).toBe(shapeId);
    expect(object.sniptaleRichShape.style.fillTransparency).toBe(1);
  });
});

it('keeps line arrowhead geometry in document state across export and restore', () => {
  const object = createCatalogObject('arrow', 'arrow-rich', 12, 18);
  object.set({ angle: 15, scaleX: 1.25, scaleY: 0.8 });

  const exported = exportRichShapeDocumentObject(object);
  const restored = createRichShapeObject(exported);

  expect(exported).toEqual(
    expect.objectContaining({
      frame: expect.objectContaining({ left: 12, top: 18 }),
      rotation: 15,
      scaleX: 1.25,
      scaleY: 0.8,
    })
  );
  expect(exported.style.line.endArrowhead).toBe('triangle');
  expect(restored?.sniptaleRichShape.style.line.endArrowhead).toBe('triangle');
  expect(restored?.sniptaleRichShape.source?.itemId).toBe('arrow');
  expect(getRichShapeTextCapability(restored as never)).toBe(false);
});

it('returns null when a document shape has no restorable catalog geometry', () => {
  expect(
    createRichShapeObject(
      createDefaultRichShapeObject({
        shapeFamily: 'custom',
        shapeKind: 'unknown-rich-shape',
        source: {
          formatVersion: null,
          importedAt: null,
          itemId: null,
          libraryId: null,
          name: null,
          type: 'custom',
        },
      })
    )
  ).toBeNull();
  expect(updateRichShapeObjectStyle({ sniptaleType: 'rectangle' } as never, {} as never)).toBe(
    false
  );
  expect(
    applyRichShapeDocumentObjectToObject(
      { sniptaleType: 'rectangle' } as never,
      createDefaultRichShapeObject()
    )
  ).toBe(false);
});

it('keeps normal Fabric fallback geometry visible for custom path and polyline primitives', () => {
  const base = createDefaultRichShapeObject({
    frame: { height: 20, left: 0, top: 0, width: 30 },
    style: {
      ...createDefaultRichShapeObject().style,
      line: {
        ...createDefaultRichShapeObject().style.line,
        beginArrowhead: 'triangle',
        endArrowhead: 'triangle',
      },
    },
  });
  const viewBox = { height: 20, minX: 0, minY: 0, width: 30 };

  expect(
    createRichShapeObject(base, {
      paths: [{ commands: [['M', 0, 0], ['L', 30, 20], ['Z']], fillRule: 'evenodd' }],
      type: 'path',
      viewBox,
    })?.getObjects().length
  ).toBeGreaterThan(1);
  expect(
    createRichShapeObject(base, {
      closed: true,
      points: [
        [0, 0],
        [30, 0],
        [30, 20],
      ],
      type: 'polyline',
      viewBox,
    })?.getObjects().length
  ).toBeGreaterThan(1);
});

it('keeps open polyline fallback geometry visible', () => {
  const base = createDefaultRichShapeObject({
    frame: { height: 20, left: 0, top: 0, width: 30 },
    style: {
      ...createDefaultRichShapeObject().style,
      line: {
        ...createDefaultRichShapeObject().style.line,
        beginArrowhead: 'triangle',
        endArrowhead: 'triangle',
      },
    },
  });
  const viewBox = { height: 20, minX: 0, minY: 0, width: 30 };

  expect(
    createRichShapeObject(base, {
      closed: false,
      points: [
        [0, 0],
        [30, 20],
      ],
      type: 'polyline',
      viewBox,
    })?.getObjects().length
  ).toBeGreaterThan(3);
  expect(
    createRichShapeObject(base, {
      closed: false,
      points: [
        [0, 0],
        [15, 10],
        [30, 20],
      ],
      type: 'polyline',
      viewBox,
    })?.getObjects().length
  ).toBeGreaterThan(3);
});

it('exposes text capability only for rich shapes with catalog text support', () => {
  const rectangle = createCatalogObject('rectangle', 'rectangle-rich');
  const line = createCatalogObject('line', 'line-rich');
  const shapeWithoutCatalog = createDefaultRichShapeObject({
    shapeKind: 'custom-text-capable',
  });
  delete shapeWithoutCatalog.source;

  expect(getRichShapeTextCapability(rectangle)).toBe(true);
  expect(getRichShapeTextCapability(line)).toBe(false);
  expect(
    getRichShapeTextCapability({
      sniptaleRichShape: shapeWithoutCatalog,
      sniptaleType: 'rich-shape',
    } as never)
  ).toBe(true);
  expect(getRichShapeTextCapability({ sniptaleType: 'rectangle' } as never)).toBe(false);
});

it('applies shape and arrow selection styles without changing the rich shape type', () => {
  const blockArrow = createCatalogObject('block-arrow', 'block');

  expect(
    updateRichShapeObjectStyle(blockArrow, {
      arrow: {
        color: '#ff0000',
        endHead: 'diamond',
        mode: 'straight',
        opacity: 0.6,
        shadow: 0,
        startHead: 'none',
        variant: 'standard',
        width: 5,
      },
      rectangle: {
        borderPresetId: null,
        customCss: '',
        fillColor: '#00ff00',
        fillOpacity: 0.4,
        inheritCustomCss: false,
        opacity: 1,
        radius: 12,
        shadow: 0,
        strokeColor: '#0000ff',
        strokeOpacity: 0.75,
        strokeStyle: 'dashed',
        strokeWidth: 6,
      },
    } as never)
  ).toBe(true);

  expect(blockArrow.sniptaleType).toBe('rich-shape');
  expect(blockArrow.sniptaleRichShape.style.fill).toEqual({ type: 'solid', color: '#00ff00' });
  expect(blockArrow.sniptaleRichShape.style.line.dashStyle).toBe('dash');
  expect(blockArrow.sniptaleRichShape.style.line.width).toBe(6);
});

it('refuses to apply a document shape when restorable geometry is unavailable', () => {
  const object = createCatalogObject('rectangle', 'shape');
  const unsupported = createDefaultRichShapeObject({
    shapeKind: 'unknown-rich-shape',
    source: {
      formatVersion: null,
      importedAt: null,
      itemId: null,
      libraryId: null,
      name: null,
      type: 'custom',
    },
  });

  expect(applyRichShapeDocumentObjectToObject(object, unsupported)).toBe(false);
  expect(object.sniptaleRichShape.shapeKind).toBe('rectangle');
});

it('applies restorable document updates without requiring source metadata', () => {
  const object = createCatalogObject('rectangle', 'shape');
  const next = createDefaultRichShapeObject({
    frame: { height: 90, left: 12, top: 18, width: 140 },
    shapeKind: 'rectangle',
    source: {
      formatVersion: null,
      importedAt: null,
      itemId: null,
      libraryId: null,
      name: null,
      type: 'custom',
    },
    text: { ...createDefaultRichShapeObject().text, content: 'No source' },
  });

  expect(applyRichShapeDocumentObjectToObject(object, next)).toBe(true);
  expect(object.left).toBe(12);
  expect(object.sniptaleRichShape.source?.itemId).toBeNull();
});
