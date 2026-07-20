// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  handleEditorDoubleClickMock: vi.fn(),
  handleEditorWindowBlurMock: vi.fn(),
  handleEditorWindowKeyDownMock: vi.fn(() => ({
    nextSpacePressed: undefined,
    preventDefault: false,
  })),
  handleEditorWindowKeyUpMock: vi.fn(() => ({})),
  isArrowObjectMock: vi.fn(() => false),
  isBlurObjectMock: vi.fn(() => false),
  isLineObjectMock: vi.fn(() => false),
  isTextboxMock: vi.fn(() => false),
  normalizeScaledAnnotationTargetMock: vi.fn(() => true),
  normalizeScaledArrowObjectMock: vi.fn(() => false),
  normalizeScaledBlurTargetMock: vi.fn(() => false),
  normalizeScaledLineObjectMock: vi.fn(() => false),
  normalizeScaledRectangleTargetMock: vi.fn(() => false),
  normalizeScaledRichShapeObjectMock: vi.fn(() => false),
  setArrowEditModeMock: vi.fn(),
  setLineEditModeMock: vi.fn(),
  syncCropGuideInteractionMock: vi.fn(() => false),
  syncSourceStateMock: vi.fn(),
}));

vi.mock('../input', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../input')>()),
  handleEditorDoubleClick: mocks.handleEditorDoubleClickMock,
  handleEditorWindowBlur: mocks.handleEditorWindowBlurMock,
  handleEditorWindowKeyDown: mocks.handleEditorWindowKeyDownMock,
  handleEditorWindowKeyUp: mocks.handleEditorWindowKeyUpMock,
}));
vi.mock('../core/helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../core/helpers')>()),
  isTextbox: mocks.isTextboxMock,
}));
vi.mock('../../objects/annotation/blur/object', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/annotation/blur/object')>()),
  isBlurObject: mocks.isBlurObjectMock,
  normalizeScaledBlurTarget: mocks.normalizeScaledBlurTargetMock,
}));
vi.mock('../../objects/shape-style', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/shape-style')>()),
  normalizeScaledRectangleTarget: mocks.normalizeScaledRectangleTargetMock,
}));
vi.mock('../../objects/arrow', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/arrow')>()),
  isArrowObject: mocks.isArrowObjectMock,
  normalizeScaledArrowObject: mocks.normalizeScaledArrowObjectMock,
  setArrowEditMode: mocks.setArrowEditModeMock,
}));
vi.mock('../../objects/line', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/line')>()),
  isLineObject: mocks.isLineObjectMock,
  normalizeScaledLineObject: mocks.normalizeScaledLineObjectMock,
  setLineEditMode: mocks.setLineEditModeMock,
}));
vi.mock('../../objects/rich-shape', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/rich-shape')>()),
  normalizeScaledRichShapeObject: mocks.normalizeScaledRichShapeObjectMock,
}));
vi.mock('../tools/annotation-resize', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../tools/annotation-resize')>()),
  normalizeScaledAnnotationTarget: mocks.normalizeScaledAnnotationTargetMock,
}));
vi.mock('./runtime.crop-guide', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./runtime.crop-guide')>()),
  syncCropGuideInteraction: mocks.syncCropGuideInteractionMock,
}));
vi.mock('./runtime.source-sync', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./runtime.source-sync')>()),
  syncSourceState: mocks.syncSourceStateMock,
}));
vi.mock('./text-callout', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./text-callout')>()),
  normalizeScaledTextCalloutTarget: vi.fn(),
  updateTextCalloutHoverCursor: vi.fn(),
}));

import { createRuntimeEventHandlers } from './runtime';

function createBindings() {
  const canvas = { requestRenderAll: vi.fn() };
  return {
    applyGridSnap: vi.fn(),
    commitHistory: vi.fn(),
    ensureObjectReachable: vi.fn(() => true),
    getActiveCropRect: vi.fn(() => null),
    getCanvas: vi.fn(() => canvas),
    getCanvasDocumentSize: vi.fn(() => ({ height: 100, width: 200 })),
    getHistoryMuted: vi.fn(() => 0),
    setCropState: vi.fn(),
    syncRuntimeState: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isArrowObjectMock.mockImplementation(
    (object?: { sniptaleType?: string }) => object?.sniptaleType === 'arrow'
  );
  mocks.isLineObjectMock.mockImplementation(
    (object?: { sniptaleType?: string }) => object?.sniptaleType === 'line'
  );
  mocks.syncCropGuideInteractionMock.mockReturnValue(false);
});

it('covers edit-mode cleanup and transform branches for line, rich-shape, and crop guide', () => {
  const bindings = createBindings();
  const handlers = createRuntimeEventHandlers(bindings as never);
  const lineTarget = { sniptaleType: 'line', setCoords: vi.fn() };
  const arrowTarget = { sniptaleType: 'arrow', setCoords: vi.fn() };
  const richTarget = { sniptaleType: 'rich-shape', setCoords: vi.fn() };
  const cropTarget = { sniptaleType: 'crop-guide', setCoords: vi.fn() };

  handlers.handleSelectionChange({
    deselected: [
      { sniptaleArrowEditMode: true, sniptaleType: 'arrow' },
      { sniptaleLineEditMode: true, sniptaleType: 'line' },
    ],
  } as never);
  mocks.normalizeScaledLineObjectMock.mockReturnValueOnce(false).mockReturnValueOnce(true);
  mocks.normalizeScaledArrowObjectMock.mockReturnValueOnce(false);
  mocks.syncCropGuideInteractionMock
    .mockReturnValueOnce(false)
    .mockReturnValueOnce(false)
    .mockReturnValueOnce(false)
    .mockReturnValueOnce(true)
    .mockReturnValueOnce(true);

  handlers.handleObjectScaling({ target: lineTarget } as never);
  handlers.handleObjectScaling({ target: lineTarget } as never);
  handlers.handleObjectScaling({ target: arrowTarget } as never);
  handlers.handleObjectScaling({ target: cropTarget } as never);
  handlers.handleObjectMoving({ target: cropTarget } as never);
  mocks.normalizeScaledRichShapeObjectMock.mockReturnValueOnce(true);
  handlers.handleObjectModified({ target: richTarget } as never);
  handlers.handleObjectResizing({ target: richTarget } as never);

  expect(mocks.setArrowEditModeMock).toHaveBeenCalledWith(
    expect.objectContaining({ sniptaleArrowEditMode: true }),
    false
  );
  expect(mocks.setLineEditModeMock).toHaveBeenCalledWith(
    expect.objectContaining({ sniptaleLineEditMode: true }),
    false
  );
  expect(mocks.normalizeScaledLineObjectMock).toHaveBeenCalledTimes(2);
  expect(mocks.normalizeScaledArrowObjectMock).toHaveBeenCalled();
  expect(richTarget.setCoords).toHaveBeenCalled();
  expect(bindings.getCanvas().requestRenderAll).toHaveBeenCalled();
  expect(bindings.syncRuntimeState).toHaveBeenCalled();
});

it('covers runtime guard and successful moving paths not owned by transform-specific tests', () => {
  const bindings = createBindings();
  const handlers = createRuntimeEventHandlers(bindings as never);
  const movableTarget = { sniptaleType: 'rectangle', setCoords: vi.fn() };

  handlers.handleCanvasBeforeRender();
  handlers.handleObjectMoving({} as never);
  handlers.handleObjectScaling({} as never);
  handlers.handleMouseMoveBefore({ e: {} as never } as never);

  bindings.getCanvas.mockReturnValueOnce({
    clearContext: vi.fn(),
    contextTop: {},
    requestRenderAll: vi.fn(),
  } as never);
  handlers.handleCanvasBeforeRender();
  handlers.handleObjectMoving({ target: movableTarget } as never);

  mocks.syncCropGuideInteractionMock.mockReturnValueOnce(true);
  handlers.handleObjectModified({ target: movableTarget } as never);

  expect(bindings.applyGridSnap).toHaveBeenCalledWith(movableTarget);
  expect(mocks.syncSourceStateMock).toHaveBeenCalledWith(bindings, movableTarget);
  expect(bindings.syncRuntimeState).toHaveBeenCalled();
});
