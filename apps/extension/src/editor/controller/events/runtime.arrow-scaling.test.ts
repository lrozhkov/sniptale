// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isArrowObjectMock: vi.fn(() => false),
  isBlurObjectMock: vi.fn(() => false),
  isLineObjectMock: vi.fn(() => false),
  normalizeScaledArrowObjectMock: vi.fn(() => false),
  normalizeScaledLineObjectMock: vi.fn(() => false),
  normalizeScaledRectangleTargetMock: vi.fn(() => false),
  setArrowEditModeMock: vi.fn(),
  setLineEditModeMock: vi.fn(),
}));

vi.mock('../core/helpers', async () => ({
  ...(await vi.importActual<typeof import('../core/helpers')>('../core/helpers')),
  isTextbox: vi.fn(() => false),
}));

vi.mock('../../objects/annotation/blur/object', async () => ({
  ...(await vi.importActual<typeof import('../../objects/annotation/blur/object')>(
    '../../objects/annotation/blur/object'
  )),
  isBlurObject: mocks.isBlurObjectMock,
  getBlurSettings: vi.fn(() => ({ amount: 10, blurType: 'gaussian', showBorder: false })),
  normalizeScaledBlurTarget: vi.fn(() => false),
  updateBlurObject: vi.fn(),
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
  setArrowEditMode: mocks.setArrowEditModeMock,
}));

vi.mock('../../objects/line', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/line')>()),
  isLineObject: mocks.isLineObjectMock,
  normalizeScaledLineObject: mocks.normalizeScaledLineObjectMock,
  setLineEditMode: mocks.setLineEditModeMock,
}));

vi.mock('../input', () => ({
  handleEditorDoubleClick: vi.fn(),
  handleEditorWindowBlur: vi.fn(),
  handleEditorWindowKeyDown: vi.fn(() => ({ nextSpacePressed: undefined, preventDefault: false })),
  handleEditorWindowKeyUp: vi.fn(() => ({})),
  resolveEditorSpaceKeyUp: vi.fn(() => false),
}));

vi.mock('../document/source', async () => ({
  ...(await vi.importActual<typeof import('../document/source')>('../document/source')),
  syncSourceStateFromObject: vi.fn((source) => source),
}));

import { createRuntimeEventHandlers } from './runtime';

function createBindings() {
  const requestRenderAll = vi.fn();
  const canvas = {
    clearContext: vi.fn(),
    contextTop: {},
    getObjects: vi.fn(() => []),
    getSelectionContext: vi.fn(() => null),
    requestRenderAll,
    viewportTransform: null,
  };
  return {
    ensureObjectReachable: vi.fn(() => true),
    getActiveCropRect: vi.fn(() => null),
    getActiveTool: vi.fn(() => 'select'),
    getCanvas: vi.fn(() => canvas),
    getCanvasDocumentSize: vi.fn(() => ({ height: 100, width: 100 })),
    getCropGuide: vi.fn(() => null),
    getHistoryMuted: vi.fn(() => 0),
    getSource: vi.fn(() => ({ id: 'source' })),
    setIsSpacePressed: vi.fn(),
    setSource: vi.fn(),
    syncRuntimeState: vi.fn(),
    applyCropSelection: vi.fn(),
    applyGridSnap: vi.fn(),
    cancelTransientInteraction: vi.fn(),
    commitHistory: vi.fn(),
    deleteSelection: vi.fn(),
    duplicateSelection: vi.fn(),
    prepareObject: vi.fn(),
    redo: vi.fn(),
    undo: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isArrowObjectMock.mockReturnValue(false);
  mocks.isBlurObjectMock.mockReturnValue(false);
  mocks.isLineObjectMock.mockReturnValue(false);
  mocks.normalizeScaledArrowObjectMock.mockReturnValue(false);
  mocks.normalizeScaledLineObjectMock.mockReturnValue(false);
  mocks.normalizeScaledRectangleTargetMock.mockReturnValue(false);
});

it('covers runtime render, moving, and modified handlers', () => {
  const bindings = createBindings();
  const canvas = bindings.getCanvas() as any;
  const selectionContext = {
    fillRect: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
    transform: vi.fn(),
  };
  canvas.getSelectionContext.mockReturnValue(selectionContext);
  canvas.viewportTransform = [1, 0, 0, 1, 0, 0] as never;
  bindings.getActiveCropRect.mockReturnValue({
    getBoundingRect: () => ({ height: 20, left: 10, top: 8, width: 30 }),
  } as never);
  const handlers = createRuntimeEventHandlers(bindings as never);

  handlers.handleCanvasBeforeRender();
  handlers.handleCanvasAfterRender();
  handlers.handleObjectMoving({ target: { sniptaleType: 'source-image' } as never });
  handlers.handleObjectModified({ target: { sniptaleType: 'source-image' } as never });

  expect(canvas.clearContext).toHaveBeenCalledWith(canvas.contextTop);
  expect(selectionContext.fillRect).toHaveBeenCalled();
  expect(bindings.applyGridSnap).toHaveBeenCalled();
  expect(bindings.ensureObjectReachable).toHaveBeenCalled();
  expect(bindings.commitHistory).toHaveBeenCalledOnce();
  expect(bindings.syncRuntimeState).toHaveBeenCalledOnce();
});

it('normalizes block-arrow scaling through the arrow owner before runtime commit', () => {
  const bindings = createBindings();
  const handlers = createRuntimeEventHandlers(bindings as never);
  const target = {
    sniptaleType: 'arrow',
    setCoords: vi.fn(),
  };
  mocks.isArrowObjectMock.mockReturnValue(true);
  mocks.normalizeScaledArrowObjectMock.mockReturnValue(true);

  handlers.handleObjectScaling({ target } as never);

  expect(mocks.normalizeScaledArrowObjectMock).toHaveBeenCalledWith(target);
  expect(bindings.ensureObjectReachable).toHaveBeenCalledWith(target);
  expect(bindings.getCanvas().requestRenderAll).toHaveBeenCalledOnce();
  expect(target.setCoords).not.toHaveBeenCalled();
});

it('keeps scaling side effects owned by the active object type', () => {
  const bindings = createBindings();
  const handlers = createRuntimeEventHandlers(bindings as never);
  const blurTarget = { dirty: false, sniptaleType: 'blur' };
  mocks.isBlurObjectMock.mockReturnValueOnce(true);
  handlers.handleObjectScaling({ target: blurTarget as never });
  expect(blurTarget.dirty).toBe(true);

  const rectangleTarget = { sniptaleType: 'rectangle', setCoords: vi.fn() };
  mocks.normalizeScaledRectangleTargetMock.mockReturnValueOnce(true);
  handlers.handleObjectScaling({ target: rectangleTarget as never });
  expect(rectangleTarget.setCoords).toHaveBeenCalledOnce();

  const sourceTarget = { sniptaleType: 'source-image', setCoords: vi.fn() };
  handlers.handleObjectScaling({ target: sourceTarget as never });
  expect(bindings.ensureObjectReachable).toHaveBeenCalledWith(sourceTarget);
});

it('stops object scaling when owner normalization rejects the target', () => {
  const bindings = createBindings();
  const handlers = createRuntimeEventHandlers(bindings as never);
  const arrowTarget = { sniptaleType: 'arrow', setCoords: vi.fn() };
  mocks.isArrowObjectMock.mockReturnValueOnce(true);
  mocks.normalizeScaledArrowObjectMock.mockReturnValueOnce(false);

  handlers.handleObjectScaling({ target: arrowTarget as never });
  handlers.handleObjectScaling({ target: { sniptaleType: 'unknown' } as never });
  handlers.handleObjectScaling({});

  expect(mocks.normalizeScaledArrowObjectMock).toHaveBeenCalledWith(arrowTarget);
  expect(bindings.ensureObjectReachable).not.toHaveBeenCalled();
  expect(bindings.getCanvas().requestRenderAll).not.toHaveBeenCalled();
});

it('normalizes line scaling through the line owner before runtime commit', () => {
  const bindings = createBindings();
  const handlers = createRuntimeEventHandlers(bindings as never);
  const target = {
    sniptaleType: 'line',
    setCoords: vi.fn(),
  };
  mocks.isArrowObjectMock.mockReturnValue(false);
  mocks.isBlurObjectMock.mockReturnValue(false);
  mocks.isLineObjectMock.mockReturnValue(true);
  mocks.normalizeScaledLineObjectMock.mockReturnValue(true);

  handlers.handleObjectScaling({ target } as never);

  expect(mocks.normalizeScaledLineObjectMock).toHaveBeenCalledWith(target);
  expect(bindings.ensureObjectReachable).toHaveBeenCalledWith(target);
  expect(bindings.getCanvas().requestRenderAll).toHaveBeenCalledOnce();
  expect(target.setCoords).not.toHaveBeenCalled();
});

it('stops line scaling when point normalization rejects the transform', () => {
  const bindings = createBindings();
  const handlers = createRuntimeEventHandlers(bindings as never);
  const target = {
    sniptaleType: 'line',
    setCoords: vi.fn(),
  };
  mocks.isArrowObjectMock.mockReturnValue(false);
  mocks.isBlurObjectMock.mockReturnValue(false);
  mocks.isLineObjectMock.mockReturnValue(true);
  mocks.normalizeScaledLineObjectMock.mockReturnValue(false);

  handlers.handleObjectScaling({ target } as never);

  expect(mocks.normalizeScaledLineObjectMock).toHaveBeenCalledWith(target);
  expect(bindings.ensureObjectReachable).not.toHaveBeenCalled();
  expect(bindings.getCanvas().requestRenderAll).not.toHaveBeenCalled();
});

it('leaves point-edit mode when arrow selections are cleared', () => {
  const bindings = createBindings();
  const handlers = createRuntimeEventHandlers(bindings as never);
  const target = {
    sniptaleArrowEditMode: true,
    sniptaleType: 'arrow',
  };
  mocks.isArrowObjectMock.mockReturnValue(true);

  handlers.handleSelectionChange({ deselected: [target as never] });

  expect(mocks.setArrowEditModeMock).toHaveBeenCalledWith(target, false);
  expect(bindings.syncRuntimeState).toHaveBeenCalledOnce();
});

it('leaves point-edit mode when line selections are cleared', () => {
  const bindings = createBindings();
  const handlers = createRuntimeEventHandlers(bindings as never);
  const target = {
    sniptaleLineEditMode: true,
    sniptaleType: 'line',
  };
  mocks.isLineObjectMock.mockReturnValue(true);

  handlers.handleSelectionChange({ deselected: [target as never] });

  expect(mocks.setLineEditModeMock).toHaveBeenCalledWith(target, false);
  expect(bindings.syncRuntimeState).toHaveBeenCalledOnce();
});
