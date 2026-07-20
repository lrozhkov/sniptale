import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  insertEditorImageObjectMock: vi.fn(),
  insertEditorRichShapeObjectMock: vi.fn(),
  insertEditorTechnicalDataObjectMock: vi.fn(),
}));

vi.mock('../../public-actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../public-actions')>()),
  insertEditorImageObject: mocks.insertEditorImageObjectMock,
  insertEditorTechnicalDataObject: mocks.insertEditorTechnicalDataObjectMock,
}));

vi.mock('../../public-actions/rich-shape', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../public-actions/rich-shape')>()),
  insertEditorRichShapeObject: mocks.insertEditorRichShapeObjectMock,
}));

import {
  insertEditorControllerImage,
  insertEditorControllerRichShape,
  insertEditorControllerTechnicalData,
} from './actions';
import type { EditorInsertionControllerApi } from './contracts';

function createController(): EditorInsertionControllerApi {
  return {
    canvas: null,
    commitHistory: vi.fn(),
    nextLabelIndex: vi.fn((type: 'image' | 'text' | 'rich-shape') =>
      type === 'image' ? 4 : type === 'rich-shape' ? 9 : 7
    ),
    prepareObject: vi.fn(),
    source: null,
    syncRuntimeState: vi.fn(),
  };
}

function invokeInsertionCallbacks(
  handlers: {
    commitHistory: () => void;
    nextLabelIndex: () => number;
    prepareObject: (object: { sniptaleId: string }) => void;
    syncRuntimeState: () => void;
  },
  controller: ReturnType<typeof createController>,
  expectedIndex: number
) {
  const object = { sniptaleId: 'prepared-layer' };

  handlers.prepareObject(object);
  handlers.commitHistory();
  handlers.syncRuntimeState();

  expect(handlers.nextLabelIndex()).toBe(expectedIndex);
  expect(controller.prepareObject).toHaveBeenCalledWith(object);
  expect(controller.commitHistory).toHaveBeenCalledOnce();
  expect(controller.syncRuntimeState).toHaveBeenCalledOnce();
}

function registerImageInsertionTest() {
  it('forwards image insertions through the public actions seam', async () => {
    const controller = createController();

    await insertEditorControllerImage(controller, 'data-url', 'Layer');
    const handlers = mocks.insertEditorImageObjectMock.mock.calls[0]?.[0];

    expect(mocks.insertEditorImageObjectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        canvas: controller.canvas,
        dataUrl: 'data-url',
        name: 'Layer',
        nextLabelIndex: expect.any(Function),
        prepareObject: expect.any(Function),
        source: controller.source,
      })
    );
    invokeInsertionCallbacks(handlers, controller, 4);
  });
}

function registerTechnicalDataInsertionTest() {
  it('forwards technical-data insertions through the public actions seam', () => {
    const controller = createController();

    insertEditorControllerTechnicalData(controller, ['browser', 'url'], 'row');
    const handlers = mocks.insertEditorTechnicalDataObjectMock.mock.calls[0]?.[0];

    expect(mocks.insertEditorTechnicalDataObjectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        canvas: controller.canvas,
        kinds: ['browser', 'url'],
        layout: 'row',
        nextLabelIndex: expect.any(Function),
        prepareObject: expect.any(Function),
        source: controller.source,
      })
    );
    invokeInsertionCallbacks(handlers, controller, 7);
  });
}

function registerRichShapeInsertionTest() {
  it('forwards rich shape insertions through the public actions seam', () => {
    const controller = createController();

    insertEditorControllerRichShape(controller, 'block-arrow');
    const handlers = mocks.insertEditorRichShapeObjectMock.mock.calls[0]?.[0];

    expect(mocks.insertEditorRichShapeObjectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        canvas: controller.canvas,
        nextLabelIndex: expect.any(Function),
        prepareObject: expect.any(Function),
        shapeId: 'block-arrow',
        source: controller.source,
      })
    );
    invokeInsertionCallbacks(handlers, controller, 9);
  });
}

describe('editor-controller public api insertions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.insertEditorImageObjectMock.mockResolvedValue(undefined);
  });

  registerImageInsertionTest();
  registerTechnicalDataInsertionTest();
  registerRichShapeInsertionTest();
});
