import { beforeEach, expect, it, vi } from 'vitest';
import { isTextStyleKeyboardAction } from './action-kind';
import { applyEditorKeyboardAction } from './dispatch';
import { applyEditorEditingKeyboardAction } from './editing-dispatch';
import { enterSelectedTextEditing, exitTextboxEditing } from './text-editing';
import type { EditorKeyboardActionOptions } from './types';

const textMocks = vi.hoisted(() => ({
  activateTextTarget: vi.fn(),
  isTextTarget: vi.fn(() => false),
  isTextbox: vi.fn(() => false),
}));

vi.mock('../../core/helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../core/helpers')>()),
  isTextbox: textMocks.isTextbox,
}));

vi.mock('../../events/text-target', () => ({
  activateTextTarget: textMocks.activateTextTarget,
  isTextTarget: textMocks.isTextTarget,
}));

type TestKeyboardActionOptions = EditorKeyboardActionOptions & {
  applyCropSelection: ReturnType<typeof vi.fn>;
  cancelTransientInteraction: ReturnType<typeof vi.fn>;
  deleteRasterSelectionPixels: ReturnType<typeof vi.fn>;
  deleteSelection: ReturnType<typeof vi.fn>;
  duplicateSelection: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.clearAllMocks();
  textMocks.isTextTarget.mockReturnValue(false);
  textMocks.isTextbox.mockReturnValue(false);
});

function createOptions(overrides: Record<string, unknown> = {}): TestKeyboardActionOptions {
  return {
    activeObject: undefined,
    applyCropSelection: vi.fn(),
    cancelTransientInteraction: vi.fn(() => true),
    canvas: null,
    copyRasterSelection: vi.fn(),
    cutRasterSelection: vi.fn(),
    deleteRasterSelectionPixels: vi.fn(),
    deleteSelection: vi.fn(),
    duplicateSelection: vi.fn(),
    pasteRasterClipboard: vi.fn(),
    redo: vi.fn(),
    undo: vi.fn(),
    ...overrides,
  } as TestKeyboardActionOptions;
}

it('keeps text-style action narrowing in the action-kind owner', () => {
  expect(isTextStyleKeyboardAction({ command: 'bold', type: 'text-style' } as never)).toBe(true);
  expect(isTextStyleKeyboardAction({ code: 'ArrowRight', deltaX: 1 } as never)).toBe(false);
});

it('keeps direct command dispatch in the keyboard dispatch owner', () => {
  const options = createOptions();

  expect(applyEditorKeyboardAction('space-down' as never, options)).toEqual({
    nextSpacePressed: true,
    preventDefault: true,
  });
  expect(applyEditorKeyboardAction('duplicate-selection' as never, options)).toEqual({
    preventDefault: true,
  });

  expect(options.duplicateSelection).toHaveBeenCalledOnce();
});

it('keeps editing commands in the editing dispatch owner', () => {
  const completeDrawSession = vi.fn(() => false);
  const options = createOptions({ completeDrawSession });

  expect(applyEditorEditingKeyboardAction('cancel-transient' as never, options)).toEqual({
    preventDefault: true,
  });
  expect(applyEditorEditingKeyboardAction('complete-draw' as never, options)).toEqual({
    preventDefault: false,
  });

  expect(options.cancelTransientInteraction).toHaveBeenCalledOnce();
  expect(completeDrawSession).toHaveBeenCalledOnce();
});

it('keeps editing side effects in the text editing owner', () => {
  const activeObject = { exitEditing: vi.fn(), id: 'text' };
  const canvas = { requestRenderAll: vi.fn() };
  const syncRuntimeState = vi.fn();
  textMocks.isTextbox.mockReturnValueOnce(true);
  textMocks.isTextTarget.mockReturnValueOnce(true);

  expect(
    applyEditorEditingKeyboardAction(
      'exit-text-edit' as never,
      createOptions({ activeObject, canvas })
    )
  ).toEqual({ preventDefault: true });
  expect(activeObject.exitEditing).toHaveBeenCalledOnce();
  expect(canvas.requestRenderAll).toHaveBeenCalledOnce();

  expect(
    applyEditorEditingKeyboardAction(
      'enter-text-edit' as never,
      createOptions({ activeObject, canvas, syncRuntimeState })
    )
  ).toEqual({ preventDefault: true });
  expect(textMocks.activateTextTarget).toHaveBeenCalledWith(
    canvas,
    activeObject,
    syncRuntimeState,
    {
      selectAll: false,
    }
  );
});

it('keeps noop text editing paths inside the text editing owner', () => {
  const activeObject = { id: 'text' };
  const canvas = { requestRenderAll: vi.fn() };
  textMocks.isTextbox.mockReturnValueOnce(false);

  exitTextboxEditing(createOptions({ activeObject, canvas }));
  enterSelectedTextEditing(createOptions({ activeObject, canvas: null }));

  expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
  expect(textMocks.activateTextTarget).not.toHaveBeenCalledWith(
    expect.anything(),
    activeObject,
    expect.anything(),
    expect.anything()
  );
});

it('keeps destructive and noop editing branches in the editing dispatch owner', () => {
  const options = createOptions();

  expect(applyEditorEditingKeyboardAction('delete-raster-selection' as never, options)).toEqual({
    preventDefault: true,
  });
  expect(applyEditorEditingKeyboardAction('delete-selection' as never, options)).toEqual({
    preventDefault: true,
  });
  expect(applyEditorEditingKeyboardAction('apply-crop' as never, options)).toEqual({
    preventDefault: true,
  });
  expect(applyEditorEditingKeyboardAction('ignore' as never, options)).toEqual({
    preventDefault: false,
  });

  expect(options.deleteRasterSelectionPixels).toHaveBeenCalledOnce();
  expect(options.deleteSelection).toHaveBeenCalledOnce();
  expect(options.applyCropSelection).toHaveBeenCalledOnce();
});

it('keeps non-editing passthrough actions inert in the editing dispatch owner', () => {
  const options = createOptions();

  [
    'undo',
    'redo',
    'space-down',
    'copy-raster-selection',
    'cut-raster-selection',
    'paste-raster-clipboard',
    'duplicate-selection',
  ].forEach((action) => {
    expect(applyEditorEditingKeyboardAction(action as never, options)).toEqual({
      preventDefault: false,
    });
  });
});
