import { beforeEach, expect, it, vi } from 'vitest';

const { createRichShapeCatalogObjectMock } = vi.hoisted(() => ({
  createRichShapeCatalogObjectMock: vi.fn(),
}));

vi.mock('../../objects/rich-shape', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/rich-shape')>()),
  createRichShapeCatalogObject: createRichShapeCatalogObjectMock,
}));

import { createRichShapeCatalogInsertionObject } from './insertions';

beforeEach(() => {
  createRichShapeCatalogObjectMock.mockReset();
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'uuid-1') });
  createRichShapeCatalogObjectMock.mockReturnValue({ id: 'rich-shape' });
});

it('creates rich shape catalog objects with generated ids and source-relative placement', () => {
  const prepareObject = vi.fn();
  const object = createRichShapeCatalogInsertionObject({
    nextLabelIndex: 4,
    prepareObject,
    shapeId: 'block-arrow',
    source: {
      left: 50,
      top: 80,
    } as never,
  });

  expect(createRichShapeCatalogObjectMock).toHaveBeenCalledWith(
    expect.objectContaining({
      id: 'uuid-1',
      labelIndex: 4,
      left: 90,
      top: 120,
    })
  );
  expect(object).toEqual({ id: 'rich-shape' });
  expect(prepareObject).toHaveBeenCalledWith(object);
});

it('returns null for unknown rich shape catalog ids', () => {
  expect(
    createRichShapeCatalogInsertionObject({
      nextLabelIndex: 4,
      prepareObject: vi.fn(),
      shapeId: 'missing-shape',
      source: { left: 0, top: 0 } as never,
    })
  ).toBeNull();
  expect(createRichShapeCatalogObjectMock).not.toHaveBeenCalled();
});
