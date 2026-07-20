import { beforeEach, expect, it, vi } from 'vitest';
import { createRichShapeToolDraft } from './draft';
import { clearRichShapeToolOrigin, markRichShapeToolOrigin } from './origin';
import { updateRichShapeDraft } from './resize';
import { resolveActiveRichShapeToolSelection } from './selection';

const mocks = vi.hoisted(() => ({
  createCustomRichShapeInsertionObject: vi.fn(),
  createRichShapeCatalogObject: vi.fn(),
  resizeRichShapeObjectToBounds: vi.fn(),
}));

vi.mock('../../../objects/rich-shape', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../objects/rich-shape')>()),
  createRichShapeCatalogObject: mocks.createRichShapeCatalogObject,
  resizeRichShapeObjectToBounds: mocks.resizeRichShapeObjectToBounds,
}));

vi.mock('../custom-rich-shape-insertion', () => ({
  createCustomRichShapeInsertionObject: mocks.createCustomRichShapeInsertionObject,
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'uuid-1') });
  mocks.createRichShapeCatalogObject.mockReturnValue({ sniptaleRichShape: {} });
  mocks.createCustomRichShapeInsertionObject.mockReturnValue({ sniptaleRichShape: {} });
});

it('owns rich shape origin metadata and active selection defaults', () => {
  const object = {};

  markRichShapeToolOrigin(object as never, 'shape-library');
  expect(object).toHaveProperty('sniptaleRichShapeToolOrigin', 'shape-library');
  clearRichShapeToolOrigin(object as never);

  expect(object).not.toHaveProperty('sniptaleRichShapeToolOrigin');
  expect(resolveActiveRichShapeToolSelection('shape-library', null)).toBeNull();
  expect(resolveActiveRichShapeToolSelection('shapes-and-lines', null)).toEqual({
    rough: false,
    shapeId: 'rectangle',
  });
  expect(
    resolveActiveRichShapeToolSelection('rough-shape', { rough: false, shapeId: 'ellipse' })
  ).toEqual({ rough: true, shapeId: 'ellipse' });
});

it('routes catalog, missing catalog, and custom draft creation through draft owners', () => {
  const prepareObject = vi.fn();
  const nextLabelIndex = vi.fn(() => 7);

  expect(
    createRichShapeToolDraft({
      nextLabelIndex,
      point: { x: 10, y: 20 } as never,
      prepareObject,
      selection: { rough: true, shapeId: 'rectangle' },
      source: {} as never,
    })
  ).toEqual({ object: { sniptaleRichShape: {} }, tool: 'rich-shape' });
  expect(mocks.createRichShapeCatalogObject).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'uuid-1', labelIndex: 7, left: 10, rough: true, top: 20 })
  );

  expect(
    createRichShapeToolDraft({
      nextLabelIndex,
      point: { x: 1, y: 2 } as never,
      prepareObject,
      selection: { customDefinition: { id: 'custom' }, rough: false, shapeId: 'custom' } as never,
      source: { left: 0, top: 0 } as never,
    })
  ).toEqual({ object: { sniptaleRichShape: {} }, tool: 'rich-shape' });
  expect(mocks.createCustomRichShapeInsertionObject).toHaveBeenCalledWith(
    expect.objectContaining({ left: 1, shapeId: 'custom', top: 2 })
  );
  expect(
    createRichShapeToolDraft({
      nextLabelIndex,
      point: { x: 0, y: 0 } as never,
      prepareObject,
      selection: { rough: false, shapeId: 'missing-shape-id' },
      source: {} as never,
    })
  ).toBeNull();
});

it('owns rich shape draft resizing and aspect-ratio fallback', () => {
  const object = {
    sniptaleRichShape: {
      geometry: { viewBox: { height: 0, width: 20 } },
    },
  };

  expect(
    updateRichShapeDraft({ object: null, tool: 'line' } as never, { x: 2, y: 3 } as never)
  ).toBeNull();
  expect(
    updateRichShapeDraft(
      { object, start: { x: 0, y: 0 }, tool: 'rich-shape' } as never,
      { x: 40, y: 10 } as never,
      true
    )
  ).toBeNull();
  expect(mocks.resizeRichShapeObjectToBounds).toHaveBeenCalledWith(
    object,
    expect.objectContaining({ height: 40, width: 40 })
  );
});
