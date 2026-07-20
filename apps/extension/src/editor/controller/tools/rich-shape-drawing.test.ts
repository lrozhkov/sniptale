import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createCustomRichShapeInsertionObject: vi.fn(),
  createRichShapeCatalogObject: vi.fn(),
  resizeRichShapeObjectToBounds: vi.fn(),
}));

vi.mock('../../objects/rich-shape', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/rich-shape')>()),
  createRichShapeCatalogObject: mocks.createRichShapeCatalogObject,
  resizeRichShapeObjectToBounds: mocks.resizeRichShapeObjectToBounds,
}));

vi.mock('./custom-rich-shape-insertion', () => ({
  createCustomRichShapeInsertionObject: mocks.createCustomRichShapeInsertionObject,
}));

import {
  clearRichShapeToolOrigin,
  createRichShapeToolDraft,
  markRichShapeToolOrigin,
  resolveActiveRichShapeToolSelection,
  updateRichShapeDraft,
} from './rich-shape-drawing';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'uuid-1') });
  mocks.createRichShapeCatalogObject.mockReturnValue({ sniptaleRichShape: {} });
  mocks.createCustomRichShapeInsertionObject.mockReturnValue({ sniptaleRichShape: {} });
});

it('marks rich shape origins and resolves active tool selections', () => {
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

it('creates catalog and custom rich shape draft objects', () => {
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
  expect(prepareObject).toHaveBeenCalledWith({ sniptaleRichShape: {} });

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
});

it('updates rich shape draft bounds and ignores unrelated draw sessions', () => {
  expect(
    updateRichShapeDraft({ object: null, tool: 'line' } as never, { x: 2, y: 3 } as never)
  ).toBeNull();

  const object = {
    sniptaleRichShape: {
      geometry: { viewBox: { height: 10, width: 20 } },
    },
  };

  expect(
    updateRichShapeDraft(
      { object, start: { x: 0, y: 0 }, tool: 'rich-shape' } as never,
      { x: 40, y: 10 } as never,
      true
    )
  ).toBeNull();
  expect(mocks.resizeRichShapeObjectToBounds).toHaveBeenCalledWith(
    object,
    expect.objectContaining({ height: 20, width: 40 })
  );
});
