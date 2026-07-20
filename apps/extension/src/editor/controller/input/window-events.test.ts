// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  applyEditorKeyboardAction: vi.fn(() => ({ preventDefault: true })),
  isEditableObject: vi.fn(() => true),
  isInteractiveShortcutTarget: vi.fn(() => false),
  isTextbox: vi.fn(() => false),
  isTextTarget: vi.fn(() => false),
  resolveEditorKeyboardAction: vi.fn(() => 'noop'),
}));

vi.mock('../core/helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../core/helpers')>()),
  isInteractiveShortcutTarget: mocks.isInteractiveShortcutTarget,
  isTextbox: mocks.isTextbox,
}));
vi.mock('../../document/model', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../document/model')>()),
  isEditableObject: mocks.isEditableObject,
}));
vi.mock('../events/text-target', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../events/text-target')>()),
  isTextTarget: mocks.isTextTarget,
}));
vi.mock('./keyboard', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./keyboard')>()),
  resolveEditorKeyboardAction: mocks.resolveEditorKeyboardAction,
}));
vi.mock('./keyboard-action-runner/dispatch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./keyboard-action-runner/dispatch')>()),
  applyEditorKeyboardAction: mocks.applyEditorKeyboardAction,
}));

import { handleEditorWindowKeyDown } from './window-keydown';
import { handleEditorWindowKeyUp } from './window-keyup';

function createKeyDownOptions(overrides: Record<string, unknown> = {}) {
  const activeObject = { isEditing: true, sniptaleId: 'text-1' };
  return {
    activeTool: 'select',
    altKey: false,
    applyCropSelection: vi.fn(),
    applyTextSelectionStyle: vi.fn(),
    cancelTransientInteraction: vi.fn(),
    canvas: {
      getActiveObject: vi.fn(() => activeObject),
      getActiveObjects: vi.fn(() => [activeObject]),
    },
    code: 'KeyB',
    copyRasterSelection: vi.fn(),
    ctrlKey: true,
    cutRasterSelection: vi.fn(),
    deleteRasterSelectionPixels: vi.fn(),
    deleteSelection: vi.fn(),
    duplicateSelection: vi.fn(),
    hasCropGuide: true,
    hasDrawSession: true,
    hasRasterSelection: true,
    key: 'b',
    metaKey: false,
    nudgeSelection: vi.fn(),
    pasteRasterClipboard: vi.fn(),
    redo: vi.fn(),
    shiftKey: false,
    syncRuntimeState: vi.fn(),
    target: document.body,
    undo: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.applyEditorKeyboardAction.mockReturnValue({ preventDefault: true });
  mocks.isEditableObject.mockReturnValue(true);
  mocks.isInteractiveShortcutTarget.mockReturnValue(false);
  mocks.isTextbox.mockReturnValue(false);
  mocks.isTextTarget.mockReturnValue(false);
  mocks.resolveEditorKeyboardAction.mockReturnValue('noop');
});

it('adapts full keydown context into keyboard action resolution and command dispatch', () => {
  mocks.isTextbox.mockReturnValue(true);
  mocks.isTextTarget.mockReturnValue(true);
  const options = createKeyDownOptions();

  expect(handleEditorWindowKeyDown(options as never)).toEqual({ preventDefault: true });

  expect(mocks.resolveEditorKeyboardAction).toHaveBeenCalledWith(
    expect.objectContaining({
      hasDrawSession: true,
      hasSelectedTextTarget: true,
      hasSelection: true,
      isEditingTextboxSelection: true,
      targetIsInteractive: false,
    })
  );
  expect(mocks.applyEditorKeyboardAction).toHaveBeenCalledWith(
    'noop',
    expect.objectContaining({
      applyTextSelectionStyle: options.applyTextSelectionStyle,
      nudgeSelection: options.nudgeSelection,
      syncRuntimeState: options.syncRuntimeState,
    })
  );
});

it('omits optional keydown callbacks and falls back to no-op runtime sync', () => {
  const options = createKeyDownOptions({
    applyTextSelectionStyle: undefined,
    canvas: null,
    completeDrawSession: undefined,
    hasDrawSession: undefined,
    nudgeSelection: undefined,
    syncRuntimeState: undefined,
  });

  handleEditorWindowKeyDown(options as never);

  expect(mocks.resolveEditorKeyboardAction).toHaveBeenCalledWith(
    expect.not.objectContaining({ hasDrawSession: expect.anything() })
  );
  expect(mocks.applyEditorKeyboardAction).toHaveBeenCalledWith(
    'noop',
    expect.not.objectContaining({
      applyTextSelectionStyle: expect.any(Function),
      completeDrawSession: expect.any(Function),
      nudgeSelection: expect.any(Function),
    })
  );
  const [, callbacks] = mocks.applyEditorKeyboardAction.mock.calls[0] as unknown as [
    string,
    { syncRuntimeState: () => void },
  ];
  expect(callbacks.syncRuntimeState()).toBeUndefined();
});

it('handles keyup finalize and space release branches', () => {
  const finalizeSelectionNudge = vi.fn();

  expect(handleEditorWindowKeyUp({ code: 'Space', finalizeSelectionNudge })).toEqual({
    nextSpacePressed: false,
  });
  expect(handleEditorWindowKeyUp({ code: 'KeyA' })).toEqual({});
  expect(finalizeSelectionNudge).toHaveBeenCalledWith('Space');
});
