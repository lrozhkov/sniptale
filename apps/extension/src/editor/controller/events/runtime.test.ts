// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRuntimeEventHandlers } from './runtime';
const {
  handleEditorDoubleClickMock,
  handleEditorWindowBlurMock,
  handleEditorWindowKeyDownMock,
  handleEditorWindowKeyUpMock,
  isTextboxMock,
  isTextTargetMock,
  resolveTextCalloutPointerZoneMock,
  resizeTextCalloutMock,
  syncSourceStateFromObjectMock,
} = vi.hoisted(() => ({
  handleEditorDoubleClickMock: vi.fn(),
  handleEditorWindowBlurMock: vi.fn(),
  handleEditorWindowKeyDownMock: vi.fn(),
  handleEditorWindowKeyUpMock: vi.fn((options: { code: string }) => ({
    nextSpacePressed: options.code === 'Space' ? false : undefined,
  })),
  isTextboxMock: vi.fn(() => false),
  isTextTargetMock: vi.fn(() => false),
  resolveTextCalloutPointerZoneMock: vi.fn(() => 'outside'),
  resizeTextCalloutMock: vi.fn(),
  syncSourceStateFromObjectMock: vi.fn(() => ({ id: 'next-source' })),
}));
vi.mock('../input', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../input')>()),
  handleEditorDoubleClick: handleEditorDoubleClickMock,
  handleEditorWindowBlur: handleEditorWindowBlurMock,
  handleEditorWindowKeyDown: handleEditorWindowKeyDownMock,
  handleEditorWindowKeyUp: handleEditorWindowKeyUpMock,
}));
vi.mock('../document/source', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../document/source')>()),
  syncSourceStateFromObject: syncSourceStateFromObjectMock,
}));
vi.mock('../core/helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../core/helpers')>()),
  isTextbox: isTextboxMock,
}));
vi.mock('../../objects/annotation/text/callout/resize', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/annotation/text/callout/resize')>()),
  resizeTextCallout: resizeTextCalloutMock,
}));
vi.mock('../../objects/annotation/text/zones', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/annotation/text/zones')>()),
  resolveTextCalloutPointerZone: resolveTextCalloutPointerZoneMock,
}));
vi.mock('./text-target', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./text-target')>()),
  isTextTarget: isTextTargetMock,
}));
function createBindings(overrides: Record<string, unknown> = {}) {
  const clearContext = vi.fn();
  const requestRenderAll = vi.fn();
  const fillRect = vi.fn();
  const ctx = { fillRect, restore: vi.fn(), save: vi.fn(), transform: vi.fn() };
  const activeObject = { sniptaleId: 'selected-object' };
  const canvas = {
    clearContext,
    contextTop: {},
    getActiveObject: vi.fn(() => activeObject),
    getActiveObjects: vi.fn(() => [activeObject]),
    getScenePoint: vi.fn(() => ({ x: 18, y: 24 })),
    getSelectionContext: vi.fn(() => ctx),
    getViewportPoint: vi.fn(() => ({ x: 48, y: 36 })),
    requestRenderAll,
    viewportTransform: [1, 0, 0, 1, 0, 0] as [number, number, number, number, number, number],
  };
  return {
    applyCropSelection: vi.fn(),
    applyGridSnap: vi.fn(),
    cancelTransientInteraction: vi.fn(() => false),
    commitHistory: vi.fn(),
    copyRasterSelection: vi.fn(),
    cutRasterSelection: vi.fn(),
    deleteRasterSelectionPixels: vi.fn(),
    deleteSelection: vi.fn(),
    duplicateSelection: vi.fn(),
    ensureObjectReachable: vi.fn(() => true),
    finalizeSelectionNudge: vi.fn(),
    getActiveCropRect: vi.fn(() => ({
      getBoundingRect: () => ({ height: 40, left: 20, top: 10, width: 80 }),
    })),
    getActiveTool: vi.fn(() => 'select'),
    getCanvas: vi.fn(() => canvas),
    getCanvasDocumentSize: vi.fn(() => ({ height: 100, width: 200 })),
    getCropGuide: vi.fn(() => ({ id: 'crop-guide' })),
    getHistoryMuted: vi.fn(() => 0),
    getIsSpacePressed: vi.fn(() => false),
    getRasterToolSession: vi.fn(() => ({ selection: null })),
    getSource: vi.fn(() => ({ id: 'source' })),
    pasteRasterClipboard: vi.fn(),
    prepareObject: vi.fn(),
    redo: vi.fn(),
    setIsSpacePressed: vi.fn(),
    setSource: vi.fn(),
    syncRuntimeState: vi.fn(),
    undo: vi.fn(),
    ...overrides,
  };
}
function verifyRuntimeCanvasAndObjectHandlers() {
  const bindings = createBindings();
  const handlers = createRuntimeEventHandlers(bindings as never);
  const movingTarget = { id: 'moving-target' };
  handlers.handleCanvasBeforeRender();
  handlers.handleCanvasAfterRender();
  handlers.handleSelectionChange({ selected: [] });
  handlers.handleObjectMoving({ target: movingTarget } as never);
  handlers.handleObjectScaling({ target: movingTarget } as never);
  handlers.handleObjectModified({ target: movingTarget } as never);
  handlers.handleDoubleClick({ e: { type: 'dblclick' }, target: movingTarget } as never);
  expect(bindings.getCanvas().clearContext).toHaveBeenCalledWith(bindings.getCanvas().contextTop);
  expect(bindings.getCanvas().getSelectionContext().fillRect).toHaveBeenCalledTimes(4);
  expect(bindings.syncRuntimeState).toHaveBeenCalledTimes(2);
  expect(bindings.applyGridSnap).toHaveBeenCalledWith(movingTarget);
  expect(bindings.setSource).toHaveBeenCalledWith({ id: 'next-source' });
  expect(bindings.getCanvas().requestRenderAll).toHaveBeenCalledOnce();
  expect(bindings.commitHistory).toHaveBeenCalledOnce();
  expect(handleEditorDoubleClickMock).toHaveBeenCalledWith(
    expect.objectContaining({ activeTool: 'select', target: movingTarget })
  );
}
function verifyRuntimeScalingHandler() {
  const bindings = createBindings();
  const handlers = createRuntimeEventHandlers(bindings as never);
  const target = {
    dirty: false,
    getBoundingRect: vi.fn(() => ({ height: 104, left: 12, top: 18, width: 312 })),
    sniptaleType: 'meta-stamp',
    set: vi.fn(),
    setCoords: vi.fn(),
    setPositionByOrigin: vi.fn(),
  };
  isTextboxMock.mockReturnValue(true);

  handlers.handleObjectScaling({ target } as never);

  expect(resizeTextCalloutMock).toHaveBeenCalledWith(target, 312, 104);
  expect(target.dirty).toBe(true);
  expect(target.setCoords).toHaveBeenCalledOnce();
  expect(bindings.ensureObjectReachable).toHaveBeenCalledWith(target);
  expect(bindings.getCanvas().requestRenderAll).toHaveBeenCalledOnce();

  handlers.handleObjectModified({ target } as never);

  expect(resizeTextCalloutMock).toHaveBeenCalledTimes(2);
  expect(resizeTextCalloutMock).toHaveBeenLastCalledWith(target, 312, 104);
  expect(target.setPositionByOrigin).toHaveBeenCalledWith(
    expect.objectContaining({ x: 12, y: 18 }),
    'left',
    'top'
  );
  expect(isTextboxMock).toHaveBeenCalledWith(target);
  expect(target.setCoords).toHaveBeenCalledTimes(2);
  expect(bindings.ensureObjectReachable).toHaveBeenCalledWith(target);
}
function verifyRuntimeHoverCursorHandler() {
  const bindings = createBindings();
  const handlers = createRuntimeEventHandlers(bindings as never);
  const target = {
    hoverCursor: null,
    sniptaleId: 'selected-object',
    sniptaleType: 'text',
    type: 'textbox',
  };
  isTextTargetMock.mockReturnValue(true);
  resolveTextCalloutPointerZoneMock.mockReturnValue('content');

  handlers.handleMouseMoveBefore({ e: { kind: 'pointer' }, target } as never);

  expect(resolveTextCalloutPointerZoneMock).toHaveBeenCalledWith(
    expect.objectContaining({
      scenePoint: { x: 18, y: 24 },
      textbox: target,
      viewportPoint: { x: 48, y: 36 },
    })
  );
  expect(target.hoverCursor).toBe('text');
  resolveTextCalloutPointerZoneMock.mockReturnValue('surface');
  handlers.handleMouseMoveBefore({ e: { kind: 'pointer' }, target } as never);
  expect(target.hoverCursor).toBeNull();
}
function verifyRuntimeKeyboardHandlers() {
  handleEditorWindowKeyDownMock.mockReturnValue({ nextSpacePressed: true, preventDefault: true });
  const bindings = createBindings({ getHistoryMuted: vi.fn(() => 1) });
  const handlers = createRuntimeEventHandlers(bindings as never);
  const preventDefault = vi.fn();

  handlers.handleObjectModified({ target: { id: 'muted-target' } } as never);
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
  handlers.handleWindowKeyUp(new KeyboardEvent('keyup', { code: 'Space' }));
  handlers.handleWindowBlur();

  expect(bindings.commitHistory).not.toHaveBeenCalled();
  expect(bindings.setIsSpacePressed).toHaveBeenNthCalledWith(1, true);
  expect(bindings.setIsSpacePressed).toHaveBeenNthCalledWith(2, false);
  expect(preventDefault).toHaveBeenCalledOnce();
  expect(handleEditorWindowKeyUpMock).toHaveBeenCalledWith({
    code: 'Space',
    finalizeSelectionNudge: expect.any(Function),
  });
  expect(handleEditorWindowBlurMock).toHaveBeenCalledWith({
    finalizeSelectionNudge: expect.any(Function),
  });
}
function verifyRuntimeEarlyReturnBranches() {
  handleEditorWindowKeyDownMock.mockReturnValue({
    nextSpacePressed: undefined,
    preventDefault: false,
  });
  const bindings = createBindings({
    ensureObjectReachable: vi.fn(() => false),
    getActiveCropRect: vi.fn(() => null),
    getCanvas: vi.fn(() => null),
  });
  const handlers = createRuntimeEventHandlers(bindings as never);
  const preventDefault = vi.fn();

  handlers.handleCanvasBeforeRender();
  handlers.handleCanvasAfterRender();
  handlers.handleObjectMoving({} as never);
  handlers.handleObjectScaling({} as never);
  handlers.handleObjectModified({} as never);
  handlers.handleWindowKeyDown({
    altKey: false,
    code: 'KeyA',
    ctrlKey: false,
    key: 'a',
    metaKey: false,
    preventDefault,
    shiftKey: false,
    target: document.body,
  } as never);
  handlers.handleWindowKeyUp(new KeyboardEvent('keyup', { code: 'KeyA' }));

  expect(bindings.applyGridSnap).not.toHaveBeenCalled();
  expect(bindings.setSource).not.toHaveBeenCalled();
  expect(bindings.setIsSpacePressed).not.toHaveBeenCalled();
  expect(preventDefault).not.toHaveBeenCalled();
}
function verifyRuntimeOverlayGuardBranches() {
  const canvas = {
    clearContext: vi.fn(),
    contextTop: {},
    getSelectionContext: vi.fn(() => null),
    requestRenderAll: vi.fn(),
    viewportTransform: null,
  };
  const bindings = createBindings({
    getCanvas: vi.fn(() => canvas),
  });
  const handlers = createRuntimeEventHandlers(bindings as never);

  handlers.handleCanvasAfterRender();
  expect(canvas.getSelectionContext).toHaveBeenCalledOnce();
}

describe('createRuntimeEventHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isTextboxMock.mockReturnValue(false);
    isTextTargetMock.mockReturnValue(false);
    resolveTextCalloutPointerZoneMock.mockReturnValue('outside');
  });
  it(
    'handles canvas overlays, selection sync, object movement, modification, and double-click delegation',
    verifyRuntimeCanvasAndObjectHandlers
  );
  it(
    'handles keyboard events, space release, and muted history branches',
    verifyRuntimeKeyboardHandlers
  );
  it('normalizes text-callout resizing live through the resize seam', verifyRuntimeScalingHandler);
  it('updates the selected text-callout hover cursor before Fabric resolves pointer feedback', () => {
    verifyRuntimeHoverCursorHandler();
  });

  it(
    'covers early-return runtime branches without mutating state',
    verifyRuntimeEarlyReturnBranches
  );
  it(
    'guards the crop overlay renderer when selection context is unavailable',
    verifyRuntimeOverlayGuardBranches
  );
});
