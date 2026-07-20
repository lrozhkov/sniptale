// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  activateTextTargetMock: vi.fn(),
  isArrowObjectMock: vi.fn<(value: unknown) => boolean>((value) => Boolean(value)),
  isLineObjectMock: vi.fn<(value: unknown) => boolean>(() => false),
  isEditorSpaceKeyMock: vi.fn((code: string) => code === 'Space'),
  isEditableObjectMock: vi.fn(() => true),
  isInteractiveShortcutTargetMock: vi.fn(() => false),
  isTextboxMock: vi.fn<(value: unknown) => boolean>((value) => {
    return Boolean((value as { kind?: string }).kind === 'textbox');
  }),
  isTextTargetMock: vi.fn(() => false),
  resolveEditorKeyboardActionMock: vi.fn(() => 'ignore'),
  updateEditorArrowOnDoubleClickMock: vi.fn(),
  updateLinePointOnDoubleClickMock: vi.fn(),
}));

vi.mock('../core/helpers', async () => ({
  ...(await vi.importActual<typeof import('../core/helpers')>('../core/helpers')),
  isInteractiveShortcutTarget: mocks.isInteractiveShortcutTargetMock,
  isTextbox: mocks.isTextboxMock,
}));
vi.mock('./interactions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./interactions')>()),
  updateEditorArrowOnDoubleClick: mocks.updateEditorArrowOnDoubleClickMock,
}));
vi.mock('./keyboard', () => ({
  isEditorSpaceKey: mocks.isEditorSpaceKeyMock,
  resolveEditorKeyboardAction: mocks.resolveEditorKeyboardActionMock,
}));
vi.mock('../events/text-target', () => ({
  activateTextTarget: mocks.activateTextTargetMock,
  isTextTarget: mocks.isTextTargetMock,
}));
vi.mock('../../objects/arrow', async () => ({
  ...(await vi.importActual<typeof import('../../objects/arrow')>('../../objects/arrow')),
  isArrowObject: mocks.isArrowObjectMock,
}));
vi.mock('../../objects/line', async () => ({
  ...(await vi.importActual<typeof import('../../objects/line')>('../../objects/line')),
  isLineObject: mocks.isLineObjectMock,
  updateLinePointOnDoubleClick: mocks.updateLinePointOnDoubleClickMock,
}));
vi.mock('../../document/model', async () => {
  const actual =
    await vi.importActual<typeof import('../../document/model')>('../../document/model');
  return { ...actual, isEditableObject: mocks.isEditableObjectMock };
});

import {
  handleEditorDoubleClick,
  handleEditorWindowBlur,
  handleEditorWindowKeyDown,
  handleEditorWindowKeyUp,
  resolveEditorSpaceKeyUp,
} from './';

function createDoubleClickCanvas() {
  return {
    getScenePoint: vi.fn(() => ({ x: 10, y: 20 })),
    requestRenderAll: vi.fn(),
    setActiveObject: vi.fn(),
  };
}

function handleSelectDoubleClick(target?: unknown, canvas = createDoubleClickCanvas()) {
  handleEditorDoubleClick({
    activeTool: 'select',
    canvas: canvas as never,
    commitHistory: vi.fn(),
    event: { type: 'dblclick' } as never,
    syncRuntimeState: vi.fn(),
    target: target as never,
  });
  return canvas;
}

function registerTextDoubleClickTest() {
  it('enters textbox editing on double click', () => {
    const textbox = { enterEditing: vi.fn(), kind: 'textbox', selectAll: vi.fn() };

    handleEditorDoubleClick({
      activeTool: 'select',
      canvas: null,
      commitHistory: vi.fn(),
      event: {} as never,
      syncRuntimeState: vi.fn(),
      target: textbox as never,
    });

    expect(textbox.enterEditing).toHaveBeenCalledOnce();
    expect(textbox.selectAll).toHaveBeenCalledOnce();
  });
}

function registerLinearDoubleClickTests() {
  it('updates arrows on double click in select mode', () => {
    const arrow = { id: 'arrow' };
    mocks.isTextboxMock.mockImplementation((value) => value === null);
    mocks.isArrowObjectMock.mockImplementation((value) => value === arrow);

    const canvas = handleSelectDoubleClick(arrow);

    expect(mocks.updateEditorArrowOnDoubleClickMock).toHaveBeenCalledWith(arrow, {
      x: 10,
      y: 20,
    });
    expect(canvas.setActiveObject).toHaveBeenCalledWith(arrow);
  });

  it('toggles line point editing on double click without committing history', () => {
    const line = { id: 'line' };
    const canvas = {
      requestRenderAll: vi.fn(),
      setActiveObject: vi.fn(),
    };
    const commitHistory = vi.fn();
    const syncRuntimeState = vi.fn();
    mocks.isTextboxMock.mockReturnValue(false);
    mocks.isLineObjectMock.mockImplementation((value) => value === line);
    mocks.isArrowObjectMock.mockReturnValue(false);

    handleEditorDoubleClick({
      activeTool: 'select',
      canvas: canvas as never,
      commitHistory,
      event: { type: 'dblclick' } as never,
      syncRuntimeState,
      target: line as never,
    });

    expect(mocks.updateLinePointOnDoubleClickMock).toHaveBeenCalledWith(line);
    expect(canvas.setActiveObject).toHaveBeenCalledWith(line);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(commitHistory).not.toHaveBeenCalled();
    expect(syncRuntimeState).toHaveBeenCalledOnce();
  });
}

function registerDoubleClickGuardTest() {
  it('ignores arrow double-click updates outside select mode or without a target', () => {
    const canvas = createDoubleClickCanvas();

    handleEditorDoubleClick({
      activeTool: 'text',
      canvas: canvas as never,
      commitHistory: vi.fn(),
      event: { type: 'dblclick' } as never,
      syncRuntimeState: vi.fn(),
      target: { id: 'arrow' } as never,
    });
    handleSelectDoubleClick(undefined, canvas);

    expect(mocks.updateEditorArrowOnDoubleClickMock).not.toHaveBeenCalled();
    expect(canvas.setActiveObject).not.toHaveBeenCalled();
  });

  it('ignores non-linear selected objects on double click', () => {
    mocks.isTextboxMock.mockReturnValue(false);
    mocks.isLineObjectMock.mockReturnValue(false);
    mocks.isArrowObjectMock.mockReturnValue(false);

    const canvas = handleSelectDoubleClick({ id: 'shape' });

    expect(mocks.updateLinePointOnDoubleClickMock).not.toHaveBeenCalled();
    expect(mocks.updateEditorArrowOnDoubleClickMock).not.toHaveBeenCalled();
    expect(canvas.setActiveObject).not.toHaveBeenCalled();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isArrowObjectMock.mockImplementation((value) => Boolean(value));
  mocks.isLineObjectMock.mockReturnValue(false);
  mocks.isTextboxMock.mockImplementation((value) =>
    Boolean((value as { kind?: string }).kind === 'textbox')
  );
});

registerTextDoubleClickTest();
registerLinearDoubleClickTests();
registerDoubleClickGuardTest();

function createKeyboardCallbacks() {
  return {
    applyCropSelection: vi.fn(),
    applyTextSelectionStyle: vi.fn(() => true),
    cancelTransientInteraction: vi.fn(() => true),
    completeDrawSession: vi.fn(() => true),
    copyRasterSelection: vi.fn(),
    cutRasterSelection: vi.fn(),
    deleteRasterSelectionPixels: vi.fn(),
    deleteSelection: vi.fn(),
    duplicateSelection: vi.fn(),
    nudgeSelection: vi.fn(() => true),
    pasteRasterClipboard: vi.fn(),
    redo: vi.fn(),
    syncRuntimeState: vi.fn(),
    undo: vi.fn(),
  };
}

function createKeyboardOptions(callbacks: ReturnType<typeof createKeyboardCallbacks>) {
  const canvas = {
    getActiveObject: vi.fn(() => ({ kind: 'text-target' })),
    getActiveObjects: vi.fn(() => [{}]),
    requestRenderAll: vi.fn(),
  };

  return {
    canvas,
    options: {
      ...callbacks,
      activeTool: 'select',
      altKey: false,
      canvas: canvas as never,
      code: 'KeyZ',
      ctrlKey: false,
      hasCropGuide: false,
      hasRasterSelection: false,
      key: 'z',
      metaKey: false,
      shiftKey: false,
      target: null,
    },
  };
}

function triggerEditorKeyboardActions(
  options: ReturnType<typeof createKeyboardOptions>['options']
) {
  for (const action of [
    'undo',
    'redo',
    'duplicate-selection',
    'copy-raster-selection',
    'cut-raster-selection',
    'paste-raster-clipboard',
    'delete-raster-selection',
    'delete-selection',
    'apply-crop',
    { command: 'bold', type: 'text-style' },
    'complete-draw',
    'cancel-transient',
  ]) {
    mocks.resolveEditorKeyboardActionMock.mockReturnValueOnce(action as never);
    expect(handleEditorWindowKeyDown(options).preventDefault).toBe(true);
  }
}

it('routes keyboard actions to editor callbacks', () => {
  const callbacks = createKeyboardCallbacks();
  const { canvas, options } = createKeyboardOptions(callbacks);

  triggerEditorKeyboardActions(options);

  mocks.resolveEditorKeyboardActionMock.mockReturnValueOnce({ dx: 1, dy: 0 } as never);
  expect(handleEditorWindowKeyDown(options).preventDefault).toBe(true);
  mocks.resolveEditorKeyboardActionMock.mockReturnValueOnce('space-down');
  expect(handleEditorWindowKeyDown(options)).toEqual({
    nextSpacePressed: true,
    preventDefault: true,
  });
  mocks.isTextTargetMock.mockReturnValue(true);
  mocks.resolveEditorKeyboardActionMock.mockReturnValueOnce('enter-text-edit');
  expect(handleEditorWindowKeyDown(options).preventDefault).toBe(true);

  expect(callbacks.undo).toHaveBeenCalledOnce();
  expect(callbacks.applyTextSelectionStyle).toHaveBeenCalledWith('bold');
  expect(callbacks.completeDrawSession).toHaveBeenCalledOnce();
  expect(callbacks.deleteSelection).toHaveBeenCalledOnce();
  expect(mocks.activateTextTargetMock).toHaveBeenCalledWith(
    canvas,
    { kind: 'text-target' },
    callbacks.syncRuntimeState,
    { selectAll: false }
  );
});

it('handles keyboard keyup and blur helpers', () => {
  const finalizeSelectionNudge = vi.fn();

  expect(handleEditorWindowKeyUp({ code: 'Space', finalizeSelectionNudge })).toEqual({
    nextSpacePressed: false,
  });
  handleEditorWindowBlur({ finalizeSelectionNudge });

  expect(finalizeSelectionNudge).toHaveBeenCalledTimes(2);
  expect(resolveEditorSpaceKeyUp('Space')).toBe(true);
});
