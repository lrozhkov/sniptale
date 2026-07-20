// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  isTextboxMock: vi.fn(() => false),
  normalizeScaledAnnotationTargetMock: vi.fn(() => true),
  normalizeScaledArrowObjectMock: vi.fn(() => false),
  normalizeScaledBlurTargetMock: vi.fn(() => false),
  normalizeScaledRectangleTargetMock: vi.fn(() => false),
  syncSourceStateMock: vi.fn(),
  normalizeScaledTextCalloutTargetMock: vi.fn(),
  updateBlurObjectMock: vi.fn(),
  updateTextCalloutHoverCursorMock: vi.fn(),
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
  updateBlurObject: mocks.updateBlurObjectMock,
  getBlurSettings: vi.fn(() => ({ amount: 10, blurType: 'gaussian', showBorder: false })),
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

vi.mock('../tools/annotation-resize', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../tools/annotation-resize')>()),
  normalizeScaledAnnotationTarget: mocks.normalizeScaledAnnotationTargetMock,
}));

vi.mock('./runtime.source-sync', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./runtime.source-sync')>()),
  syncSourceState: mocks.syncSourceStateMock,
}));

import { createRuntimeEventHandlers } from './runtime';

function createBindings() {
  const clearContext = vi.fn();
  const fillRect = vi.fn();
  const overlayContext = {
    fillRect,
    restore: vi.fn(),
    save: vi.fn(),
    transform: vi.fn(),
  };
  const requestRenderAll = vi.fn();
  const canvas = {
    clearContext,
    contextTop: {},
    getSelectionContext: vi.fn(() => overlayContext),
    requestRenderAll,
    viewportTransform: [1, 0, 0, 1, 0, 0] as [number, number, number, number, number, number],
  };
  return {
    applyCropSelection: vi.fn(),
    applyGridSnap: vi.fn(),
    cancelTransientInteraction: vi.fn(),
    commitHistory: vi.fn(),
    copyRasterSelection: vi.fn(),
    cutRasterSelection: vi.fn(),
    deleteRasterSelectionPixels: vi.fn(),
    deleteSelection: vi.fn(),
    duplicateSelection: vi.fn(),
    ensureObjectReachable: vi.fn(() => true),
    getActiveCropRect: vi.fn(() => ({
      getBoundingRect: () => ({ height: 40, left: 20, top: 10, width: 80 }),
    })),
    getActiveTool: vi.fn(() => 'select'),
    getCanvas: vi.fn(() => canvas),
    getCanvasDocumentSize: vi.fn(() => ({ height: 100, width: 100 })),
    getCropGuide: vi.fn(() => null),
    getHistoryMuted: vi.fn(() => 0),
    getRasterToolSession: vi.fn(() => ({ selection: null })),
    getSource: vi.fn(() => ({ id: 'source' })),
    pasteRasterClipboard: vi.fn(),
    prepareObject: vi.fn(),
    redo: vi.fn(),
    setIsSpacePressed: vi.fn(),
    setSource: vi.fn(),
    syncRuntimeState: vi.fn(),
    undo: vi.fn(),
  };
}

function resetRuntimeCoverageMocks() {
  vi.clearAllMocks();
  mocks.handleEditorWindowKeyUpMock.mockReturnValue({});
  mocks.isArrowObjectMock.mockReturnValue(false);
  mocks.isBlurObjectMock.mockReturnValue(false);
  mocks.isTextboxMock.mockReturnValue(false);
  mocks.normalizeScaledAnnotationTargetMock.mockReturnValue(true);
  mocks.normalizeScaledArrowObjectMock.mockReturnValue(false);
  mocks.normalizeScaledBlurTargetMock.mockReturnValue(false);
  mocks.normalizeScaledRectangleTargetMock.mockReturnValue(false);
}

function registerIntegrationCoverageTest() {
  it('covers the non-text runtime handlers through one focused integration path', () => {
    const bindings = createBindings();
    const handlers = createRuntimeEventHandlers(bindings as never);
    const target = { sniptaleType: 'arrow', setCoords: vi.fn() };
    mocks.isArrowObjectMock.mockReturnValue(true);
    mocks.normalizeScaledArrowObjectMock.mockReturnValue(true);
    mocks.handleEditorWindowKeyUpMock.mockReturnValue({ nextSpacePressed: false });

    handlers.handleCanvasBeforeRender();
    handlers.handleCanvasAfterRender();
    handlers.handleSelectionChange();
    handlers.handleMouseMoveBefore({ e: { type: 'pointermove' }, target } as never);
    handlers.handleObjectMoving({ target } as never);
    handlers.handleObjectScaling({ target } as never);
    handlers.handleObjectModified({ target } as never);
    handlers.handleDoubleClick({ e: { type: 'dblclick' }, target } as never);
    handlers.handleWindowKeyDown({
      altKey: false,
      code: 'Space',
      ctrlKey: false,
      key: ' ',
      metaKey: false,
      preventDefault: vi.fn(),
      shiftKey: false,
      target: document.body,
    } as never);
    handlers.handleWindowKeyUp(new KeyboardEvent('keyup', { code: 'Space' }));

    expect(bindings.getCanvas().clearContext).toHaveBeenCalledWith(bindings.getCanvas().contextTop);
    expect(bindings.getCanvas().getSelectionContext().fillRect).toHaveBeenCalledTimes(4);
    expect(mocks.updateTextCalloutHoverCursorMock).toHaveBeenCalledWith(
      bindings.getCanvas(),
      expect.objectContaining({ e: { type: 'pointermove' }, target })
    );
    expect(bindings.applyGridSnap).toHaveBeenCalledWith(target);
    expect(bindings.ensureObjectReachable).toHaveBeenCalledWith(target);
    expect(mocks.syncSourceStateMock).toHaveBeenCalledTimes(2);
    expect(bindings.commitHistory).toHaveBeenCalledOnce();
    expect(bindings.syncRuntimeState).toHaveBeenCalledTimes(2);
    expect(bindings.getCanvas().requestRenderAll).toHaveBeenCalled();
    expect(mocks.handleEditorDoubleClickMock).toHaveBeenCalled();
    expect(bindings.setIsSpacePressed).toHaveBeenCalledWith(false);
  });
}

function registerTextCalloutCoverageTest() {
  it('covers live text-callout scaling normalization without committing muted history', () => {
    const bindings = createBindings();
    bindings.getHistoryMuted.mockReturnValue(1);
    const handlers = createRuntimeEventHandlers(bindings as never);
    const target = { dirty: false, sniptaleType: 'text', setCoords: vi.fn() };
    mocks.isTextboxMock.mockReturnValue(true);

    handlers.handleObjectScaling({ target } as never);

    expect(mocks.normalizeScaledTextCalloutTargetMock).toHaveBeenCalledWith(target, undefined);
    expect(target.dirty).toBe(true);

    handlers.handleObjectModified({ target } as never);

    expect(mocks.normalizeScaledTextCalloutTargetMock).toHaveBeenCalledTimes(2);
    expect(mocks.normalizeScaledTextCalloutTargetMock).toHaveBeenCalledWith(target, undefined);
    expect(bindings.ensureObjectReachable).toHaveBeenCalledWith(target);
    expect(bindings.getCanvas().requestRenderAll).toHaveBeenCalledOnce();
    expect(bindings.commitHistory).not.toHaveBeenCalled();
    expect(bindings.syncRuntimeState).not.toHaveBeenCalled();
  });
}

function registerAnnotationCoverageTest() {
  it('covers annotation normalization branches, including the early-return path', () => {
    const bindings = createBindings();
    const handlers = createRuntimeEventHandlers(bindings as never);
    const target = { sniptaleType: 'pencil', setCoords: vi.fn() };
    mocks.normalizeScaledAnnotationTargetMock.mockReturnValueOnce(false).mockReturnValueOnce(true);

    handlers.handleObjectScaling({ target } as never);
    handlers.handleObjectScaling({ target } as never);

    expect(mocks.normalizeScaledAnnotationTargetMock).toHaveBeenCalledTimes(2);
    expect(target.setCoords).toHaveBeenCalledOnce();
    expect(bindings.ensureObjectReachable).toHaveBeenCalledTimes(1);
    expect(bindings.getCanvas().requestRenderAll).toHaveBeenCalledTimes(1);
  });
}

function registerGuardCoverageTest() {
  it('covers early-return runtime guards for missing targets, canvas, and crop overlay state', () => {
    const bindings = createBindings();
    bindings.getCanvas.mockReturnValue(null as never);
    bindings.getActiveCropRect.mockReturnValue(null as never);
    const handlers = createRuntimeEventHandlers(bindings as never);

    handlers.handleCanvasBeforeRender();
    handlers.handleCanvasAfterRender();
    handlers.handleMouseMoveBefore({ e: { type: 'pointermove' } } as never);
    handlers.handleObjectMoving({} as never);
    handlers.handleObjectScaling({} as never);
    handlers.handleObjectModified({} as never);
    handlers.handleWindowKeyUp(new KeyboardEvent('keyup', { code: 'KeyA' }));

    expect(bindings.applyGridSnap).not.toHaveBeenCalled();
    expect(bindings.commitHistory).toHaveBeenCalledOnce();
    expect(bindings.setIsSpacePressed).not.toHaveBeenCalled();
  });
}

function registerBlurAndSourceCoverageTests() {
  it('covers blur and source-image scaling branches plus explicit window key handling', () => {
    const bindings = createBindings();
    const handlers = createRuntimeEventHandlers(bindings as never);
    const blurTarget = { dirty: false, kind: 'blur', sniptaleType: 'blur', setCoords: vi.fn() };
    const sourceTarget = { sniptaleType: 'source-image', setCoords: vi.fn() };
    const preventDefault = vi.fn();
    mocks.isBlurObjectMock.mockReturnValue(true);
    mocks.normalizeScaledBlurTargetMock.mockReturnValue(true);
    mocks.handleEditorWindowKeyDownMock.mockImplementationOnce(
      () => ({ nextSpacePressed: true, preventDefault: true }) as never
    );

    handlers.handleObjectScaling({ target: blurTarget } as never);
    handlers.handleObjectModified({ target: blurTarget } as never);
    mocks.isBlurObjectMock.mockReturnValue(false);
    handlers.handleObjectScaling({ target: sourceTarget } as never);
    handlers.handleWindowKeyDown({
      altKey: false,
      code: 'Space',
      ctrlKey: false,
      key: ' ',
      metaKey: false,
      preventDefault,
      shiftKey: false,
      target: document.body,
    } as never);

    expect(blurTarget.dirty).toBe(true);
    expect(mocks.normalizeScaledBlurTargetMock).toHaveBeenCalledOnce();
    expect(mocks.updateBlurObjectMock).toHaveBeenCalledWith(blurTarget, {
      settings: { amount: 10, blurType: 'gaussian', showBorder: false },
    });
    expect(mocks.syncSourceStateMock).toHaveBeenCalledWith(bindings, sourceTarget);
    expect(bindings.setIsSpacePressed).toHaveBeenCalledWith(true);
    expect(preventDefault).toHaveBeenCalledOnce();
  });
}

describe('runtime coverage', () => {
  beforeEach(() => {
    resetRuntimeCoverageMocks();
  });
  registerIntegrationCoverageTest();
  registerTextCalloutCoverageTest();
  registerAnnotationCoverageTest();
  registerGuardCoverageTest();
  registerBlurAndSourceCoverageTests();
});
