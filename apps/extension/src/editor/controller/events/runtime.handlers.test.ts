import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  handleEditorDoubleClickMock: vi.fn(),
  handleEditorWindowBlurMock: vi.fn(),
  handleEditorWindowKeyDownMock: vi.fn(() => ({
    nextSpacePressed: undefined as boolean | undefined,
    preventDefault: false,
  })),
  handleEditorWindowKeyUpMock: vi.fn(() => ({})),
  getBlurSettingsMock: vi.fn(() => ({ radius: 12 })),
  isArrowObjectMock: vi.fn(() => false),
  isBlurObjectMock: vi.fn(() => false),
  isTextboxMock: vi.fn(() => false),
  normalizeScaledAnnotationTargetMock: vi.fn(() => false),
  normalizeScaledArrowObjectMock: vi.fn(() => true),
  normalizeScaledBlurTargetMock: vi.fn(() => false),
  normalizeScaledRectangleTargetMock: vi.fn(() => false),
  normalizeScaledTextCalloutTargetMock: vi.fn(),
  syncSourceStateFromObjectMock: vi.fn(() => ({ id: 'next-source' })),
  updateBlurObjectMock: vi.fn(),
  updateTextCalloutHoverCursorMock: vi.fn(),
}));

vi.mock('../core/helpers', async () => ({
  ...(await vi.importActual<typeof import('../core/helpers')>('../core/helpers')),
  isTextbox: mocks.isTextboxMock,
}));

vi.mock('../document/source', async () => ({
  ...(await vi.importActual<typeof import('../document/source')>('../document/source')),
  syncSourceStateFromObject: mocks.syncSourceStateFromObjectMock,
}));

vi.mock('../input', () => ({
  handleEditorDoubleClick: mocks.handleEditorDoubleClickMock,
  handleEditorWindowBlur: mocks.handleEditorWindowBlurMock,
  handleEditorWindowKeyDown: mocks.handleEditorWindowKeyDownMock,
  handleEditorWindowKeyUp: mocks.handleEditorWindowKeyUpMock,
  resolveEditorSpaceKeyUp: vi.fn(() => false),
}));

vi.mock('../../objects/annotation/blur/object', async () => ({
  ...(await vi.importActual<typeof import('../../objects/annotation/blur/object')>(
    '../../objects/annotation/blur/object'
  )),
  getBlurSettings: mocks.getBlurSettingsMock,
  isBlurObject: mocks.isBlurObjectMock,
  normalizeScaledBlurTarget: mocks.normalizeScaledBlurTargetMock,
  updateBlurObject: mocks.updateBlurObjectMock,
}));
vi.mock('../../objects/shape-style', async () => ({
  ...(await vi.importActual<typeof import('../../objects/shape-style')>(
    '../../objects/shape-style'
  )),
  normalizeScaledRectangleTarget: mocks.normalizeScaledRectangleTargetMock,
}));
vi.mock('../../objects/arrow', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/arrow')>()),
  isArrowObject: mocks.isArrowObjectMock,
  normalizeScaledArrowObject: mocks.normalizeScaledArrowObjectMock,
}));

vi.mock('./text-callout', async () => ({
  ...(await vi.importActual<typeof import('./text-callout')>('./text-callout')),
  normalizeScaledTextCalloutTarget: mocks.normalizeScaledTextCalloutTargetMock,
  updateTextCalloutHoverCursor: mocks.updateTextCalloutHoverCursorMock,
}));

vi.mock('../tools/annotation-resize', () => ({
  normalizeScaledAnnotationTarget: mocks.normalizeScaledAnnotationTargetMock,
}));

import { createRuntimeEventHandlers } from './runtime';

function createCanvas(overrides: Record<string, unknown> = {}) {
  const selectionContext = {
    fillRect: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
    transform: vi.fn(),
  };
  return {
    clearContext: vi.fn(),
    contextTop: {},
    getSelectionContext: vi.fn(() => selectionContext),
    requestRenderAll: vi.fn(),
    viewportTransform: [1, 0, 0, 1, 0, 0],
    ...overrides,
  };
}

function createBindings(overrides: Record<string, unknown> = {}) {
  const canvas = createCanvas();
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
    getActiveCropRect: vi.fn(() => ({
      getBoundingRect: () => ({ height: 40, left: 20, top: 10, width: 80 }),
    })),
    getActiveTool: vi.fn(() => 'select'),
    getCanvas: vi.fn(() => canvas),
    getCanvasDocumentSize: vi.fn(() => ({ height: 100, width: 200 })),
    getCropGuide: vi.fn(() => ({ id: 'crop-guide' })),
    getHistoryMuted: vi.fn(() => 0),
    getRasterToolSession: vi.fn(() => ({ selection: null })),
    getSource: vi.fn(() => ({ id: 'source' })),
    finalizeSelectionNudge: vi.fn(),
    nudgeSelection: vi.fn(() => true),
    pasteRasterClipboard: vi.fn(),
    redo: vi.fn(),
    setIsSpacePressed: vi.fn(),
    setSource: vi.fn(),
    syncRuntimeState: vi.fn(),
    undo: vi.fn(),
    ...overrides,
  };
}

function registerCanvasHandlerTest() {
  it('handles before-render cleanup and crop overlay drawing through canvas context ownership', () => {
    const bindings = createBindings();
    const handlers = createRuntimeEventHandlers(bindings as never);

    handlers.handleCanvasBeforeRender();
    handlers.handleCanvasAfterRender();

    expect(bindings.getCanvas().clearContext).toHaveBeenCalledWith(bindings.getCanvas().contextTop);
    expect(bindings.getCanvas().getSelectionContext().save).toHaveBeenCalledOnce();
    expect(bindings.getCanvas().getSelectionContext().transform).toHaveBeenCalledWith(
      1,
      0,
      0,
      1,
      0,
      0
    );
    expect(bindings.getCanvas().getSelectionContext().fillRect).toHaveBeenCalledTimes(4);
    expect(bindings.getCanvas().getSelectionContext().restore).toHaveBeenCalledOnce();
  });
}

function registerCanvasGuardTest() {
  it('guards overlay rendering when crop prerequisites are missing', () => {
    const noCanvasHandlers = createRuntimeEventHandlers(
      createBindings({ getCanvas: vi.fn(() => null) }) as never
    );
    const noCropHandlers = createRuntimeEventHandlers(
      createBindings({ getActiveCropRect: vi.fn(() => null) }) as never
    );
    const noContextHandlers = createRuntimeEventHandlers(
      createBindings({
        getCanvas: vi.fn(() => createCanvas({ getSelectionContext: vi.fn(() => null) })),
      }) as never
    );
    const noViewportHandlers = createRuntimeEventHandlers(
      createBindings({
        getCanvas: vi.fn(() => createCanvas({ viewportTransform: null })),
      }) as never
    );

    noCanvasHandlers.handleCanvasBeforeRender();
    noCanvasHandlers.handleCanvasAfterRender();
    noCropHandlers.handleCanvasAfterRender();
    noContextHandlers.handleCanvasAfterRender();
    noViewportHandlers.handleCanvasAfterRender();
  });

  it('captures contextTop once before clearing so export-time context churn cannot pass undefined', () => {
    const clearContext = vi.fn();
    let reads = 0;
    const canvas = {
      clearContext,
      getSelectionContext: vi.fn(() => null),
      requestRenderAll: vi.fn(),
      viewportTransform: [1, 0, 0, 1, 0, 0],
      get contextTop() {
        reads += 1;
        return reads === 1 ? { id: 'top-context' } : undefined;
      },
    };
    const handlers = createRuntimeEventHandlers(
      createBindings({ getCanvas: vi.fn(() => canvas) }) as never
    );

    expect(() => handlers.handleCanvasBeforeRender()).not.toThrow();
    expect(clearContext).toHaveBeenCalledWith({ id: 'top-context' });
  });
}

function registerObjectLifecycleTest() {
  it('syncs selection changes, moving objects, and object modifications', () => {
    const bindings = createBindings();
    const handlers = createRuntimeEventHandlers(bindings as never);
    const target = { id: 'moving-target' };

    handlers.handleSelectionChange();
    handlers.handleObjectMoving({ target } as never);
    handlers.handleObjectModified({ target } as never);

    expect(bindings.syncRuntimeState).toHaveBeenCalledTimes(2);
    expect(bindings.applyGridSnap).toHaveBeenCalledWith(target);
    expect(bindings.setSource).toHaveBeenCalledWith({ id: 'next-source' });
    expect(bindings.commitHistory).toHaveBeenCalledOnce();
  });
}

function registerObjectGuardTest() {
  it('skips moving and history commits when target is absent or recovery fails', () => {
    const bindings = createBindings({
      ensureObjectReachable: vi.fn(() => false),
      getHistoryMuted: vi.fn(() => 1),
    });
    const handlers = createRuntimeEventHandlers(bindings as never);

    handlers.handleObjectMoving({} as never);
    handlers.handleObjectModified({ target: { id: 'muted-target' } } as never);

    expect(bindings.applyGridSnap).not.toHaveBeenCalled();
    expect(bindings.setSource).toHaveBeenCalledWith({ id: 'next-source' });
    expect(bindings.commitHistory).not.toHaveBeenCalled();
    expect(bindings.syncRuntimeState).not.toHaveBeenCalled();
  });
}

function registerDelegationHandlerTest() {
  it('delegates double click, hover, and keyboard ownership to the active handler seams', () => {
    const bindings = createBindings();
    const handlers = createRuntimeEventHandlers(bindings as never);
    const preventDefault = vi.fn();
    const target = { id: 'hover-target' };
    mocks.handleEditorWindowKeyDownMock.mockReturnValue({
      nextSpacePressed: true as boolean | undefined,
      preventDefault: true,
    });
    mocks.handleEditorWindowKeyUpMock.mockReturnValue({ nextSpacePressed: false });

    handlers.handleDoubleClick({ e: { type: 'dblclick' }, target } as never);
    handlers.handleMouseMoveBefore({ e: { type: 'move' }, target } as never);
    handlers.handleWindowKeyDown({
      altKey: false,
      code: 'Space',
      ctrlKey: false,
      key: ' ',
      metaKey: false,
      preventDefault,
      shiftKey: false,
      target: null,
    } as never);
    handlers.handleWindowKeyUp({ code: 'Space' } as KeyboardEvent);
    handlers.handleWindowBlur();

    expect(mocks.handleEditorDoubleClickMock).toHaveBeenCalledWith(
      expect.objectContaining({ activeTool: 'select', target })
    );
    expect(mocks.updateTextCalloutHoverCursorMock).toHaveBeenCalledWith(
      bindings.getCanvas(),
      expect.objectContaining({ target })
    );
    expect(bindings.setIsSpacePressed).toHaveBeenNthCalledWith(1, true);
    expect(bindings.setIsSpacePressed).toHaveBeenNthCalledWith(2, false);
    expect(mocks.handleEditorWindowKeyUpMock).toHaveBeenCalledWith({
      code: 'Space',
      finalizeSelectionNudge: expect.any(Function),
    });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(mocks.handleEditorWindowBlurMock).toHaveBeenCalledOnce();
  });
}

function runRuntimeHandlersSuite() {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.handleEditorWindowKeyDownMock.mockReturnValue({
      nextSpacePressed: undefined,
      preventDefault: false,
    });
  });
  registerCanvasHandlerTest();
  registerCanvasGuardTest();
  registerObjectLifecycleTest();
  registerObjectGuardTest();
  registerDelegationHandlerTest();
}

describe('runtime event handler seam', runRuntimeHandlersSuite);
