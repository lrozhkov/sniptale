// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  activateTextTargetMock: vi.fn(),
  isArrowObjectMock: vi.fn<(value: unknown) => boolean>((value) => Boolean(value)),
  isEditorSpaceKeyMock: vi.fn((code: string) => code === 'Space'),
  isEditableObjectMock: vi.fn(() => true),
  isInteractiveShortcutTargetMock: vi.fn(() => false),
  isTextboxMock: vi.fn<(value: unknown) => boolean>((value) => {
    return Boolean((value as { kind?: string }).kind === 'textbox');
  }),
  isTextTargetMock: vi.fn(() => false),
  resolveEditorKeyboardActionMock: vi.fn(() => 'ignore'),
  updateEditorArrowOnDoubleClickMock: vi.fn(),
}));

vi.mock('../core/helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../core/helpers')>()),
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
vi.mock('../../objects', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects')>()),
  isArrowObject: mocks.isArrowObjectMock,
}));
vi.mock('../../document/model', async () => {
  const actual =
    await vi.importActual<typeof import('../../document/model')>('../../document/model');
  return { ...actual, isEditableObject: mocks.isEditableObjectMock };
});

import { handleEditorWindowKeyDown, resolveEditorSpaceKeyUp } from './';

function createKeyboardCanvas() {
  const activeTextbox = { exitEditing: vi.fn(), isEditing: true, kind: 'textbox' };
  const canvas = {
    getActiveObject: () => activeTextbox,
    getActiveObjects: () => [activeTextbox],
    requestRenderAll: vi.fn(),
  };
  return { activeTextbox, canvas };
}

function createKeyboardArgs(
  overrides: Partial<Parameters<typeof handleEditorWindowKeyDown>[0]> = {}
) {
  const { canvas } = createKeyboardCanvas();

  return {
    altKey: false,
    activeTool: 'select',
    applyCropSelection: vi.fn(),
    canvas: canvas as never,
    cancelTransientInteraction: vi.fn(() => false),
    completeDrawSession: vi.fn(() => true),
    code: 'KeyA',
    ctrlKey: false,
    copyRasterSelection: vi.fn(),
    cutRasterSelection: vi.fn(),
    deleteRasterSelectionPixels: vi.fn(),
    deleteSelection: vi.fn(),
    duplicateSelection: vi.fn(),
    hasCropGuide: false,
    hasRasterSelection: false,
    key: 'a',
    metaKey: false,
    pasteRasterClipboard: vi.fn(),
    redo: vi.fn(),
    shiftKey: false,
    target: null,
    undo: vi.fn(),
    ...overrides,
  };
}

function registerSpaceDownTest() {
  it('maps the space-down keyboard action', () => {
    mocks.resolveEditorKeyboardActionMock.mockReturnValueOnce('space-down');

    expect(
      handleEditorWindowKeyDown(
        createKeyboardArgs({
          code: 'Space',
          key: ' ',
        })
      )
    ).toEqual({ nextSpacePressed: true, preventDefault: true });
  });
}

function registerUndoRedoTest() {
  it('maps undo and redo keyboard actions', () => {
    const undo = vi.fn();
    const redo = vi.fn();
    mocks.resolveEditorKeyboardActionMock.mockReturnValueOnce('undo').mockReturnValueOnce('redo');

    expect(
      handleEditorWindowKeyDown(
        createKeyboardArgs({
          code: 'KeyZ',
          ctrlKey: true,
          key: 'z',
          redo,
          undo,
        })
      )
    ).toEqual({ preventDefault: true });
    expect(
      handleEditorWindowKeyDown(
        createKeyboardArgs({
          code: 'KeyY',
          ctrlKey: true,
          key: 'y',
          redo,
          undo,
        })
      )
    ).toEqual({ preventDefault: true });

    expect(undo).toHaveBeenCalledOnce();
    expect(redo).toHaveBeenCalledOnce();
  });
}

function registerDuplicateAndCropTest() {
  it('maps duplicate-selection and apply-crop keyboard actions', () => {
    const duplicateSelection = vi.fn();
    const applyCropSelection = vi.fn();
    const completeDrawSession = vi.fn(() => true);
    mocks.resolveEditorKeyboardActionMock
      .mockReturnValueOnce('duplicate-selection')
      .mockReturnValueOnce('apply-crop')
      .mockReturnValueOnce('complete-draw');

    expect(
      handleEditorWindowKeyDown(
        createKeyboardArgs({
          code: 'KeyD',
          ctrlKey: true,
          duplicateSelection,
          key: 'd',
        })
      )
    ).toEqual({ preventDefault: true });
    expect(
      handleEditorWindowKeyDown(
        createKeyboardArgs({
          applyCropSelection,
          code: 'Enter',
          hasCropGuide: true,
          key: 'Enter',
        })
      )
    ).toEqual({ preventDefault: true });
    expect(
      handleEditorWindowKeyDown(
        createKeyboardArgs({
          code: 'Enter',
          completeDrawSession,
          hasDrawSession: true,
          key: 'Enter',
        })
      )
    ).toEqual({ preventDefault: true });

    expect(duplicateSelection).toHaveBeenCalledOnce();
    expect(applyCropSelection).toHaveBeenCalledOnce();
    expect(completeDrawSession).toHaveBeenCalledOnce();
  });
}

function registerCancelAndIgnoreTest() {
  it('maps cancel-transient and ignore keyboard actions', () => {
    const cancelTransientInteraction = vi.fn(() => true);
    mocks.resolveEditorKeyboardActionMock
      .mockReturnValueOnce('cancel-transient')
      .mockReturnValueOnce('ignore');

    expect(
      handleEditorWindowKeyDown(
        createKeyboardArgs({
          cancelTransientInteraction,
          code: 'Escape',
          key: 'Escape',
        })
      )
    ).toEqual({ preventDefault: true });
    expect(
      handleEditorWindowKeyDown(
        createKeyboardArgs({
          cancelTransientInteraction,
        })
      )
    ).toEqual({ preventDefault: false });

    expect(cancelTransientInteraction).toHaveBeenCalledOnce();
  });
}

function registerNudgeFallbackTest() {
  it('keeps object keyboard nudges inert when no nudge handler is available', () => {
    mocks.resolveEditorKeyboardActionMock.mockReturnValueOnce({
      code: 'ArrowRight',
      deltaX: 1,
      deltaY: 0,
      step: 1,
    } as never);
    const args = createKeyboardArgs({
      code: 'ArrowRight',
      key: 'ArrowRight',
    });
    delete (args as { nudgeSelection?: unknown }).nudgeSelection;

    expect(handleEditorWindowKeyDown(args)).toEqual({ preventDefault: false });
  });
}

function registerRasterClipboardActionTest() {
  it('maps raster clipboard and destructive selection keyboard actions', () => {
    const copyRasterSelection = vi.fn();
    const cutRasterSelection = vi.fn();
    const pasteRasterClipboard = vi.fn();
    const deleteRasterSelectionPixels = vi.fn();
    mocks.resolveEditorKeyboardActionMock
      .mockReturnValueOnce('copy-raster-selection')
      .mockReturnValueOnce('cut-raster-selection')
      .mockReturnValueOnce('paste-raster-clipboard')
      .mockReturnValueOnce('delete-raster-selection');

    expect(handleEditorWindowKeyDown(createKeyboardArgs({ copyRasterSelection }))).toEqual({
      preventDefault: true,
    });
    expect(handleEditorWindowKeyDown(createKeyboardArgs({ cutRasterSelection }))).toEqual({
      preventDefault: true,
    });
    expect(handleEditorWindowKeyDown(createKeyboardArgs({ pasteRasterClipboard }))).toEqual({
      preventDefault: true,
    });
    expect(handleEditorWindowKeyDown(createKeyboardArgs({ deleteRasterSelectionPixels }))).toEqual({
      preventDefault: true,
    });

    expect(copyRasterSelection).toHaveBeenCalledOnce();
    expect(cutRasterSelection).toHaveBeenCalledOnce();
    expect(pasteRasterClipboard).toHaveBeenCalledOnce();
    expect(deleteRasterSelectionPixels).toHaveBeenCalledOnce();
  });
}

function registerSpaceKeyTest() {
  it('resolves the space-key release through the keyboard helper', () => {
    expect(resolveEditorSpaceKeyUp('Space')).toBe(true);
  });
}

describe('editor-controller input keyboard action matrix', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isTextboxMock.mockImplementation((value) =>
      Boolean((value as { kind?: string }).kind === 'textbox')
    );
  });

  registerSpaceDownTest();
  registerUndoRedoTest();
  registerDuplicateAndCropTest();
  registerCancelAndIgnoreTest();
  registerNudgeFallbackTest();
  registerRasterClipboardActionTest();
  registerSpaceKeyTest();
});
