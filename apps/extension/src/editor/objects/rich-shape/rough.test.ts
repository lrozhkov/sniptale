// @vitest-environment jsdom

import { expect, it } from 'vitest';
import {
  createDefaultRichShapeObject,
  createEnabledRichShapeRoughStyle,
  DEFAULT_RICH_SHAPE_SOURCE,
  EDITOR_BUILT_IN_SHAPE_CATEGORY,
  getEditorBuiltInShapeEntry,
  type EditorBuiltInShapeCategory,
} from '../../../features/editor/document/rich-shape';
import {
  createRichShapeCatalogObject,
  createRichShapeObject,
  isRichShapeObject,
  type RichShapeGroup,
} from './';

const REPRESENTATIVE_BY_CATEGORY = {
  [EDITOR_BUILT_IN_SHAPE_CATEGORY.LINES]: 'arrow',
  [EDITOR_BUILT_IN_SHAPE_CATEGORY.BASIC]: 'oval',
  [EDITOR_BUILT_IN_SHAPE_CATEGORY.BLOCK_ARROWS]: 'block-arrow',
  [EDITOR_BUILT_IN_SHAPE_CATEGORY.FLOWCHART]: 'flowchart-decision',
  [EDITOR_BUILT_IN_SHAPE_CATEGORY.CALLOUTS]: 'rect-callout',
} satisfies Partial<Record<EditorBuiltInShapeCategory, string>>;

function getEntry(id: string) {
  const entry = getEditorBuiltInShapeEntry(id);
  if (!entry) {
    throw new Error(`Missing catalog entry ${id}`);
  }
  return entry;
}

function getRenderableSignatures(object: RichShapeGroup): string[] {
  return object
    .getObjects()
    .filter((child) => child.opacity !== 0)
    .map((child) => JSON.stringify(child.toObject(['path', 'stroke', 'fill', 'strokeWidth'])));
}

it('renders representative catalog categories through Rough.js when rough style is enabled', () => {
  Object.values(REPRESENTATIVE_BY_CATEGORY).forEach((shapeId, index) => {
    const object = createRichShapeCatalogObject({
      entry: getEntry(shapeId),
      id: `rough-shape-${index}`,
      labelIndex: index + 1,
      left: 40,
      rough: true,
      top: 50,
    });

    expect(isRichShapeObject(object)).toBe(true);
    expect(object.sniptaleRichShape.rough.enabled).toBe(true);
    expect(object.getObjects().length).toBeGreaterThan(1);
  });
});

it('keeps Rough.js rendering deterministic for the same object seed and settings', () => {
  const shape = createDefaultRichShapeObject({
    id: 'rough-stable',
    frame: { height: 80, left: 0, top: 0, width: 120 },
    rough: createEnabledRichShapeRoughStyle('rough-stable', {
      fillStyle: 'cross-hatch',
      roughness: 2,
    }),
    shapeKind: 'rectangle',
    source: { ...DEFAULT_RICH_SHAPE_SOURCE, itemId: 'rectangle' },
  });
  const first = createRichShapeObject(shape);
  const second = createRichShapeObject(JSON.parse(JSON.stringify(shape)));

  expect(first).not.toBeNull();
  expect(second).not.toBeNull();
  expect(getRenderableSignatures(first as RichShapeGroup)).toEqual(
    getRenderableSignatures(second as RichShapeGroup)
  );
});

it('keeps unsupported Rough.js paths visible through the Fabric fallback path', () => {
  const object = createRichShapeObject(
    createDefaultRichShapeObject({
      id: 'rough-fallback',
      rough: createEnabledRichShapeRoughStyle('rough-fallback'),
    }),
    {
      paths: [{ commands: [['M', 0, 0], ['L', 10, 10], ['Z']], fillRule: 'evenodd' }],
      type: 'path',
      viewBox: { height: 10, minX: 0, minY: 0, width: 10 },
    }
  );

  expect(object).not.toBeNull();
  expect(object?.getObjects().length).toBeGreaterThan(1);
});
