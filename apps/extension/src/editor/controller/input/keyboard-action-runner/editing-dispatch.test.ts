import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  cancelText: vi.fn(),
  enterText: vi.fn(),
  exitText: vi.fn(),
}));

vi.mock('./text-editing', () => ({
  cancelTextboxEditing: mocks.cancelText,
  enterSelectedTextEditing: mocks.enterText,
  exitTextboxEditing: mocks.exitText,
}));

import { applyEditorEditingKeyboardAction } from './editing-dispatch';

beforeEach(() => vi.clearAllMocks());

function createOptions() {
  return {
    activeObject: undefined,
    applyCropSelection: vi.fn(),
    cancelTransientInteraction: vi.fn(() => true),
    canvas: null,
    completeDrawSession: vi.fn(() => true),
    deleteSelection: vi.fn(),
    duplicateSelection: vi.fn(),
    redo: vi.fn(),
    undo: vi.fn(),
  };
}

it('routes text entry, commit, and cancellation to their lifecycle owners', () => {
  const options = createOptions();

  expect(applyEditorEditingKeyboardAction('enter-text-edit', options)).toEqual({
    preventDefault: true,
  });
  expect(applyEditorEditingKeyboardAction('exit-text-edit', options)).toEqual({
    preventDefault: true,
  });
  expect(applyEditorEditingKeyboardAction('cancel-text-edit', options)).toEqual({
    preventDefault: true,
  });

  expect(mocks.enterText).toHaveBeenCalledWith(options);
  expect(mocks.exitText).toHaveBeenCalledWith(options);
  expect(mocks.cancelText).toHaveBeenCalledWith(options);
});

it('dispatches transient, selection, crop, and draw completion commands', () => {
  const options = createOptions();

  expect(applyEditorEditingKeyboardAction('cancel-transient', options)).toEqual({
    preventDefault: true,
  });
  expect(applyEditorEditingKeyboardAction('delete-selection', options)).toEqual({
    preventDefault: true,
  });
  expect(applyEditorEditingKeyboardAction('apply-crop', options)).toEqual({
    preventDefault: true,
  });
  expect(applyEditorEditingKeyboardAction('complete-draw', options)).toEqual({
    preventDefault: true,
  });

  expect(options.deleteSelection).toHaveBeenCalledOnce();
  expect(options.applyCropSelection).toHaveBeenCalledOnce();
  expect(options.completeDrawSession).toHaveBeenCalledOnce();

  const { completeDrawSession: _complete, ...withoutComplete } = options;
  expect(applyEditorEditingKeyboardAction('complete-draw', withoutComplete)).toEqual({
    preventDefault: false,
  });
});

it('ignores commands owned by the outer dispatcher', () => {
  const options = createOptions();
  const actions = ['ignore', 'undo', 'redo', 'space-down', 'duplicate-selection'] as const;

  actions.forEach((action) => {
    expect(applyEditorEditingKeyboardAction(action, options)).toEqual({ preventDefault: false });
  });
});
