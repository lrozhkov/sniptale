import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getBlurSettingsMock: vi.fn(() => ({ amount: 12, blurType: 'gaussian', showBorder: false })),
  isArrowObjectMock: vi.fn(() => false),
  isBlurObjectMock: vi.fn(() => false),
  isTextboxMock: vi.fn(() => false),
  normalizeScaledAnnotationTargetMock: vi.fn(() => true),
  normalizeScaledArrowObjectMock: vi.fn(() => false),
  normalizeScaledBlurTargetMock: vi.fn(() => false),
  normalizeScaledRectangleTargetMock: vi.fn(() => false),
  normalizeScaledTextCalloutTargetMock: vi.fn(),
  updateBlurObjectMock: vi.fn(),
  updateTextCalloutHoverCursorMock: vi.fn(),
  handleEditorDoubleClickMock: vi.fn(),
  handleEditorWindowBlurMock: vi.fn(),
  handleEditorWindowKeyDownMock: vi.fn(() => ({ preventDefault: false })),
  handleEditorWindowKeyUpMock: vi.fn(() => ({})),
  syncSourceStateMock: vi.fn(),
}));

vi.mock('../core/helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../core/helpers')>()),
  isTextbox: mocks.isTextboxMock,
}));

vi.mock('../../objects/annotation/blur/object', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/annotation/blur/object')>()),
  getBlurSettings: mocks.getBlurSettingsMock,
  isBlurObject: mocks.isBlurObjectMock,
  normalizeScaledBlurTarget: mocks.normalizeScaledBlurTargetMock,
  updateBlurObject: mocks.updateBlurObjectMock,
}));
vi.mock('../../objects/shape-style', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/shape-style')>()),
  normalizeScaledRectangleTarget: mocks.normalizeScaledRectangleTargetMock,
}));
vi.mock('../../objects/arrow', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/arrow')>()),
  isArrowObject: mocks.isArrowObjectMock,
  normalizeScaledArrowObject: mocks.normalizeScaledArrowObjectMock,
}));

vi.mock('./text-callout', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./text-callout')>()),
  normalizeScaledTextCalloutTarget: mocks.normalizeScaledTextCalloutTargetMock,
  updateTextCalloutHoverCursor: mocks.updateTextCalloutHoverCursorMock,
}));

vi.mock('../tools/annotation-resize', () => ({
  normalizeScaledAnnotationTarget: mocks.normalizeScaledAnnotationTargetMock,
}));

vi.mock('./runtime.source-sync', () => ({
  syncSourceState: mocks.syncSourceStateMock,
}));

vi.mock('../input', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../input')>()),
  handleEditorDoubleClick: mocks.handleEditorDoubleClickMock,
  handleEditorWindowBlur: mocks.handleEditorWindowBlurMock,
  handleEditorWindowKeyDown: mocks.handleEditorWindowKeyDownMock,
  handleEditorWindowKeyUp: mocks.handleEditorWindowKeyUpMock,
}));

import { createRuntimeEventHandlers } from './runtime';

function createBindings(overrides: Record<string, unknown> = {}) {
  const canvas = {
    clearContext: vi.fn(),
    contextTop: { id: 'top' },
    getSelectionContext: vi.fn(() => null),
    requestRenderAll: vi.fn(),
    viewportTransform: [1, 0, 0, 1, 0, 0],
  };

  return {
    applyCropSelection: vi.fn(),
    applyGridSnap: vi.fn(),
    cancelTransientInteraction: vi.fn(() => false),
    commitHistory: vi.fn(),
    deleteSelection: vi.fn(),
    duplicateSelection: vi.fn(),
    ensureObjectReachable: vi.fn(() => true),
    getActiveCropRect: vi.fn(() => null),
    getActiveTool: vi.fn(() => 'select'),
    getCanvas: vi.fn(() => canvas),
    getCanvasDocumentSize: vi.fn(() => ({ height: 100, width: 100 })),
    getCropGuide: vi.fn(() => null),
    getHistoryMuted: vi.fn(() => 0),
    getSource: vi.fn(() => ({ id: 'source' })),
    prepareObject: vi.fn(),
    redo: vi.fn(),
    setIsSpacePressed: vi.fn(),
    setSource: vi.fn(),
    syncRuntimeState: vi.fn(),
    undo: vi.fn(),
    ...overrides,
  };
}

function registerScalingBranchTest() {
  it('covers blur, arrow, rectangle, source-image, and annotation scaling branches', () => {
    const bindings = createBindings();
    const handlers = createRuntimeEventHandlers(bindings as never);
    const blurTarget = { sniptaleType: 'blur', setCoords: vi.fn() };
    const arrowTarget = { sniptaleType: 'arrow', setCoords: vi.fn() };
    const rectangleTarget = { sniptaleType: 'rectangle', setCoords: vi.fn() };
    const sourceTarget = { sniptaleType: 'source-image', setCoords: vi.fn() };
    const annotationTarget = { sniptaleType: 'pencil', setCoords: vi.fn() };

    mocks.isBlurObjectMock.mockReturnValueOnce(true);
    handlers.handleObjectScaling({ target: blurTarget } as never);

    mocks.isArrowObjectMock.mockReturnValueOnce(true);
    mocks.normalizeScaledArrowObjectMock.mockReturnValueOnce(true);
    handlers.handleObjectScaling({ target: arrowTarget } as never);

    mocks.normalizeScaledRectangleTargetMock.mockReturnValueOnce(true);
    handlers.handleObjectScaling({ target: rectangleTarget } as never);

    handlers.handleObjectScaling({ target: sourceTarget } as never);

    mocks.normalizeScaledAnnotationTargetMock.mockReturnValueOnce(false).mockReturnValueOnce(true);
    handlers.handleObjectScaling({ target: annotationTarget } as never);
    handlers.handleObjectScaling({ target: annotationTarget } as never);

    expect(mocks.normalizeScaledBlurTargetMock).not.toHaveBeenCalled();
    expect(mocks.updateBlurObjectMock).not.toHaveBeenCalled();
    expect(blurTarget).toEqual(expect.objectContaining({ dirty: true }));
    expect(bindings.getCanvas().requestRenderAll).toHaveBeenCalledTimes(5);
    expect(bindings.ensureObjectReachable).toHaveBeenCalledTimes(5);
    expect(mocks.syncSourceStateMock).toHaveBeenCalledWith(bindings, sourceTarget);
    expect(rectangleTarget.setCoords).toHaveBeenCalledOnce();
    expect(annotationTarget.setCoords).toHaveBeenCalledOnce();
  });
}

function registerBlurModifiedBranchTest() {
  it('normalizes blur dimensions after handle resize is finished', () => {
    const bindings = createBindings();
    const handlers = createRuntimeEventHandlers(bindings as never);
    const target = { sniptaleType: 'blur', setCoords: vi.fn() };

    mocks.isBlurObjectMock.mockReturnValueOnce(true);
    mocks.normalizeScaledBlurTargetMock.mockReturnValueOnce(true);
    handlers.handleObjectModified({ target } as never);

    expect(mocks.normalizeScaledBlurTargetMock).toHaveBeenCalledWith(target);
    expect(mocks.updateBlurObjectMock).toHaveBeenCalledWith(target, {
      settings: { amount: 12, blurType: 'gaussian', showBorder: false },
    });
    expect(bindings.commitHistory).toHaveBeenCalledOnce();
    expect(bindings.syncRuntimeState).toHaveBeenCalledOnce();
  });
}

function registerTextAndHistoryBranchTest() {
  it('covers live text-callout resize normalization and object-modified history guards', () => {
    const bindings = createBindings();
    const handlers = createRuntimeEventHandlers(bindings as never);
    const target = { dirty: false, sniptaleType: 'text', setCoords: vi.fn() };

    mocks.isTextboxMock.mockReturnValue(true);
    handlers.handleObjectScaling({ target } as never);
    expect(mocks.normalizeScaledTextCalloutTargetMock).toHaveBeenCalledWith(target, undefined);
    expect(target.dirty).toBe(true);

    handlers.handleObjectResizing({ target } as never);

    handlers.handleObjectModified({ target } as never);

    bindings.getHistoryMuted.mockReturnValue(1);
    handlers.handleObjectModified({ target } as never);
    handlers.handleObjectModified({} as never);

    expect(mocks.normalizeScaledTextCalloutTargetMock).toHaveBeenCalledTimes(4);
    expect(mocks.normalizeScaledTextCalloutTargetMock).toHaveBeenCalledWith(target, undefined);
    expect(bindings.commitHistory).toHaveBeenCalledOnce();
    expect(bindings.syncRuntimeState).toHaveBeenCalledOnce();
  });
}

describe('editor-controller-events/runtime branch coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  registerScalingBranchTest();
  registerBlurModifiedBranchTest();
  registerTextAndHistoryBranchTest();
});
