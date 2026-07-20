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
vi.mock('../../objects/arrow', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/arrow')>()),
  isArrowObject: mocks.isArrowObjectMock,
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
} from './';

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
    applyTextSelectionStyle: vi.fn(() => true),
    canvas: canvas as never,
    cancelTransientInteraction: vi.fn(() => false),
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

function registerTextStyleKeyboardTest() {
  it('maps text-style keyboard actions to the selected text formatting seam', () => {
    const applyTextSelectionStyle = vi.fn(() => true);
    mocks.resolveEditorKeyboardActionMock.mockReturnValueOnce({
      command: 'underline',
      type: 'text-style',
    } as never);

    expect(
      handleEditorWindowKeyDown(
        createKeyboardArgs({
          applyTextSelectionStyle,
          code: 'KeyU',
          ctrlKey: true,
          key: 'u',
        })
      )
    ).toEqual({ preventDefault: true });
    expect(applyTextSelectionStyle).toHaveBeenCalledWith('underline');
  });
}

function registerDeleteKeyboardTest() {
  it('maps delete-selection keyboard actions', () => {
    const deleteSelection = vi.fn();
    mocks.resolveEditorKeyboardActionMock.mockReturnValueOnce('delete-selection');

    expect(
      handleEditorWindowKeyDown(
        createKeyboardArgs({
          code: 'Delete',
          deleteSelection,
          key: 'Delete',
        })
      )
    ).toEqual({ preventDefault: true });
    expect(deleteSelection).toHaveBeenCalledOnce();
  });
}

function registerEnterTextKeyboardTest() {
  it('maps enter-text-edit keyboard actions', () => {
    const { activeTextbox, canvas } = createKeyboardCanvas();
    const syncRuntimeState = vi.fn();
    mocks.resolveEditorKeyboardActionMock.mockReturnValueOnce('enter-text-edit');
    mocks.isTextTargetMock.mockReturnValue(true);

    expect(
      handleEditorWindowKeyDown(
        createKeyboardArgs({
          canvas: canvas as never,
          code: 'Enter',
          key: 'Enter',
          syncRuntimeState,
        })
      )
    ).toEqual({ preventDefault: true });
    expect(mocks.activateTextTargetMock).toHaveBeenCalledWith(
      canvas,
      activeTextbox,
      syncRuntimeState,
      { selectAll: false }
    );
  });

  it('uses a safe no-op runtime sync when Enter editing has no sync callback', () => {
    const { activeTextbox, canvas } = createKeyboardCanvas();
    mocks.resolveEditorKeyboardActionMock.mockReturnValueOnce('enter-text-edit');
    mocks.isTextTargetMock.mockReturnValue(true);
    const args = createKeyboardArgs({
      canvas: canvas as never,
      code: 'Enter',
      key: 'Enter',
    });
    delete (args as { syncRuntimeState?: unknown }).syncRuntimeState;

    expect(handleEditorWindowKeyDown(args)).toEqual({ preventDefault: true });
    expect(mocks.activateTextTargetMock).toHaveBeenCalledWith(
      canvas,
      activeTextbox,
      expect.any(Function),
      { selectAll: false }
    );
  });
}

function registerExitTextKeyboardTest() {
  it('maps exit-text-edit keyboard actions', () => {
    const { activeTextbox, canvas } = createKeyboardCanvas();
    mocks.resolveEditorKeyboardActionMock.mockReturnValueOnce('exit-text-edit');

    expect(
      handleEditorWindowKeyDown(
        createKeyboardArgs({
          canvas: canvas as never,
          code: 'Escape',
          key: 'Escape',
        })
      )
    ).toEqual({ preventDefault: true });
    expect(activeTextbox.exitEditing).toHaveBeenCalledOnce();
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
  });
}

function registerPointerAndWindowUtilityTest() {
  it('covers double-click arrow delegation and window key release utilities', () => {
    const target = { id: 'arrow' };
    const canvas = {
      getScenePoint: vi.fn(() => ({ x: 10, y: 12 })),
      requestRenderAll: vi.fn(),
      setActiveObject: vi.fn(),
    };
    const commitHistory = vi.fn();
    const syncRuntimeState = vi.fn();
    const finalizeSelectionNudge = vi.fn();
    mocks.isArrowObjectMock.mockReturnValue(true);

    handleEditorDoubleClick({
      activeTool: 'select',
      canvas: canvas as never,
      commitHistory,
      event: {} as never,
      syncRuntimeState,
      target: target as never,
    });

    expect(mocks.updateEditorArrowOnDoubleClickMock).toHaveBeenCalledWith(target, {
      x: 10,
      y: 12,
    });
    expect(canvas.setActiveObject).toHaveBeenCalledWith(target);
    expect(commitHistory).toHaveBeenCalledOnce();
    expect(syncRuntimeState).toHaveBeenCalledOnce();
    expect(handleEditorWindowKeyUp({ code: 'Space', finalizeSelectionNudge })).toEqual({
      nextSpacePressed: false,
    });
    handleEditorWindowBlur({ finalizeSelectionNudge });
    expect(finalizeSelectionNudge).toHaveBeenCalledTimes(2);
  });
}

describe('editor-controller input keyboard seams', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isTextboxMock.mockImplementation((value) =>
      Boolean((value as { kind?: string }).kind === 'textbox')
    );
  });

  registerDeleteKeyboardTest();
  registerTextStyleKeyboardTest();
  registerEnterTextKeyboardTest();
  registerExitTextKeyboardTest();
  registerPointerAndWindowUtilityTest();
});
