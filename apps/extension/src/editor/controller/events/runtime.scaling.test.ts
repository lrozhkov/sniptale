import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  handleEditorDoubleClickMock: vi.fn(),
  handleEditorWindowKeyDownMock: vi.fn(() => ({
    nextSpacePressed: undefined as boolean | undefined,
    preventDefault: false,
  })),
  isArrowObjectMock: vi.fn(() => false),
  isBlurObjectMock: vi.fn(() => false),
  isTextboxMock: vi.fn(() => false),
  normalizeScaledAnnotationTargetMock: vi.fn(() => false),
  normalizeScaledArrowObjectMock: vi.fn(() => true),
  normalizeScaledBlurTargetMock: vi.fn(() => false),
  normalizeScaledRectangleTargetMock: vi.fn(() => false),
  normalizeScaledTextCalloutTargetMock: vi.fn(),
  updateBlurObjectMock: vi.fn(),
  updateTextCalloutHoverCursorMock: vi.fn(),
}));

vi.mock('../core/helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../core/helpers')>()),
  isTextbox: mocks.isTextboxMock,
}));

vi.mock('../document/source', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../document/source')>()),
  syncSourceStateFromObject: vi.fn((source) => source),
}));

vi.mock('../input', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../input')>()),
  handleEditorDoubleClick: mocks.handleEditorDoubleClickMock,
  handleEditorWindowKeyDown: mocks.handleEditorWindowKeyDownMock,
  resolveEditorSpaceKeyUp: () => false,
}));

vi.mock('../../objects/annotation/blur/object', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/annotation/blur/object')>()),
  isBlurObject: mocks.isBlurObjectMock,
  getBlurSettings: vi.fn(() => ({ amount: 10, blurType: 'gaussian', showBorder: false })),
  normalizeScaledBlurTarget: mocks.normalizeScaledBlurTargetMock,
  updateBlurObject: mocks.updateBlurObjectMock,
}));
vi.mock('../../objects/arrow', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/arrow')>()),
  isArrowObject: mocks.isArrowObjectMock,
  normalizeScaledArrowObject: mocks.normalizeScaledArrowObjectMock,
}));
vi.mock('../../objects/shape-style', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/shape-style')>()),
  normalizeScaledRectangleTarget: mocks.normalizeScaledRectangleTargetMock,
}));

vi.mock('./text-callout', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./text-callout')>()),
  normalizeScaledTextCalloutTarget: mocks.normalizeScaledTextCalloutTargetMock,
  updateTextCalloutHoverCursor: mocks.updateTextCalloutHoverCursorMock,
}));

vi.mock('../tools/annotation-resize', () => ({
  normalizeScaledAnnotationTarget: mocks.normalizeScaledAnnotationTargetMock,
}));

import { createRuntimeEventHandlers } from './runtime';

function createBindings() {
  const canvas = { requestRenderAll: vi.fn() };
  return {
    commitHistory: vi.fn(),
    ensureObjectReachable: vi.fn(() => true),
    getCanvas: vi.fn(() => canvas),
    getHistoryMuted: vi.fn(() => 0),
    getSource: vi.fn(() => ({ id: 'source' })),
    setSource: vi.fn(),
    syncRuntimeState: vi.fn(),
  };
}

function registerTextScalingTest() {
  it('normalizes text-callout scaling live so glyphs are never stretched', () => {
    const bindings = createBindings();
    const handlers = createRuntimeEventHandlers(bindings as never);
    const target = { dirty: false, sniptaleType: 'text', setCoords: vi.fn() };
    const transform = { originX: 'left', originY: 'top' };
    mocks.isTextboxMock.mockReturnValue(true);

    handlers.handleObjectScaling({ target, transform } as never);

    expect(mocks.normalizeScaledTextCalloutTargetMock).toHaveBeenCalledWith(target, transform);
    expect(target.dirty).toBe(true);
    expect(target.setCoords).not.toHaveBeenCalled();
    expect(bindings.ensureObjectReachable).toHaveBeenCalledWith(target);
    expect(bindings.getCanvas().requestRenderAll).toHaveBeenCalledOnce();

    handlers.handleObjectModified({ target, transform } as never);

    expect(mocks.normalizeScaledTextCalloutTargetMock).toHaveBeenLastCalledWith(target, transform);
  });
}

function registerArrowScalingGuardTest() {
  it('stops early when arrow scaling normalization rejects the target', () => {
    const bindings = createBindings();
    const handlers = createRuntimeEventHandlers(bindings as never);
    const target = { sniptaleType: 'arrow', setCoords: vi.fn() };
    mocks.isArrowObjectMock.mockReturnValue(true);
    mocks.normalizeScaledArrowObjectMock.mockReturnValue(false);

    handlers.handleObjectScaling({ target } as never);

    expect(bindings.ensureObjectReachable).not.toHaveBeenCalled();
    expect(bindings.getCanvas().requestRenderAll).not.toHaveBeenCalled();
  });
}

function registerRectangleScalingTest() {
  it('reapplies rectangle coords after rectangle geometry normalization', () => {
    const bindings = createBindings();
    const handlers = createRuntimeEventHandlers(bindings as never);
    const target = { sniptaleType: 'rectangle', setCoords: vi.fn() };
    mocks.normalizeScaledRectangleTargetMock.mockReturnValue(true);

    handlers.handleObjectScaling({ target } as never);

    expect(target.setCoords).toHaveBeenCalledOnce();
    expect(bindings.ensureObjectReachable).toHaveBeenCalledWith(target);
  });
}

function registerBlurScalingOwnerTest() {
  it('keeps live blur handle scaling visual until Fabric completes the transform', () => {
    const bindings = createBindings();
    const handlers = createRuntimeEventHandlers(bindings as never);
    const target = { dirty: false, sniptaleType: 'blur', setCoords: vi.fn() };
    mocks.isBlurObjectMock.mockReturnValue(true);
    mocks.normalizeScaledBlurTargetMock.mockReturnValue(true);

    handlers.handleObjectScaling({ target } as never);

    expect(mocks.normalizeScaledBlurTargetMock).not.toHaveBeenCalled();
    expect(mocks.updateBlurObjectMock).not.toHaveBeenCalled();
    expect(target.dirty).toBe(true);
    expect(bindings.ensureObjectReachable).toHaveBeenCalledWith(target);
    expect(bindings.getCanvas().requestRenderAll).toHaveBeenCalledOnce();
  });
}

function registerBlurModifiedOwnerTest() {
  it('reroutes completed blur handle resize through the blur owner after normalization', () => {
    const bindings = createBindings();
    const handlers = createRuntimeEventHandlers(bindings as never);
    const target = { sniptaleType: 'blur', setCoords: vi.fn() };
    mocks.isBlurObjectMock.mockReturnValueOnce(true);
    mocks.normalizeScaledBlurTargetMock.mockReturnValueOnce(true);

    handlers.handleObjectModified({ target } as never);

    expect(mocks.normalizeScaledBlurTargetMock).toHaveBeenCalledWith(target);
    expect(mocks.updateBlurObjectMock).toHaveBeenCalledWith(target, {
      settings: { amount: 10, blurType: 'gaussian', showBorder: false },
    });
    expect(bindings.ensureObjectReachable).toHaveBeenCalledWith(target);
  });
}

function registerAnnotationScalingFallbackTest() {
  it('keeps generic annotation fallback responsible for non-rectangle annotation scaling', () => {
    const bindings = createBindings();
    const handlers = createRuntimeEventHandlers(bindings as never);
    const target = { sniptaleType: 'pencil', setCoords: vi.fn() };

    handlers.handleObjectScaling({ target } as never);
    expect(bindings.ensureObjectReachable).not.toHaveBeenCalled();

    mocks.normalizeScaledAnnotationTargetMock.mockReturnValue(true);
    handlers.handleObjectScaling({ target } as never);

    expect(mocks.normalizeScaledAnnotationTargetMock).toHaveBeenCalledWith(target);
    expect(target.setCoords).toHaveBeenCalledOnce();
    expect(bindings.ensureObjectReachable).toHaveBeenCalledWith(target);
  });
}

function runRuntimeScalingSuite() {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isArrowObjectMock.mockReturnValue(false);
    mocks.isBlurObjectMock.mockReturnValue(false);
    mocks.isTextboxMock.mockReturnValue(false);
    mocks.normalizeScaledAnnotationTargetMock.mockReturnValue(false);
    mocks.normalizeScaledArrowObjectMock.mockReturnValue(true);
    mocks.normalizeScaledBlurTargetMock.mockReturnValue(false);
    mocks.normalizeScaledRectangleTargetMock.mockReturnValue(false);
  });
  registerTextScalingTest();
  registerArrowScalingGuardTest();
  registerBlurScalingOwnerTest();
  registerBlurModifiedOwnerTest();
  registerRectangleScalingTest();
  registerAnnotationScalingFallbackTest();
}

describe('runtime scaling seam', runRuntimeScalingSuite);
