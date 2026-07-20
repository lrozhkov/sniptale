import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  insertEditorRichShapeObjectMock: vi.fn(),
}));

vi.mock('../public-actions/rich-shape', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../public-actions/rich-shape')>()),
  insertEditorRichShapeObject: mocks.insertEditorRichShapeObjectMock,
}));

import { insertEditorControllerRichShapeWithOptions } from './rich-shape-insertion';
import type { EditorInsertionControllerApi } from './insertions/contracts';

function createController(): EditorInsertionControllerApi {
  return {
    canvas: null,
    commitHistory: vi.fn(),
    nextLabelIndex: vi.fn(() => 7),
    prepareObject: vi.fn(),
    source: null,
    syncRuntimeState: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

it('forwards rough rich shape insertion through public adapters', () => {
  const controller = createController();

  insertEditorControllerRichShapeWithOptions(controller, 'block-arrow', { rough: true });

  expect(mocks.insertEditorRichShapeObjectMock).toHaveBeenCalledWith(
    expect.objectContaining({ rough: true, shapeId: 'block-arrow' })
  );
});
