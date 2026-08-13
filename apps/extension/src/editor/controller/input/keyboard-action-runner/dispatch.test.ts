import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  applyEditing: vi.fn(() => ({ preventDefault: true })),
}));

vi.mock('./editing-dispatch', () => ({
  applyEditorEditingKeyboardAction: mocks.applyEditing,
}));

import { applyEditorKeyboardAction } from './dispatch';

beforeEach(() => vi.clearAllMocks());

function createOptions() {
  return {
    activeObject: undefined,
    applyCropSelection: vi.fn(),
    applyTextSelectionStyle: vi.fn(() => true),
    cancelTransientInteraction: vi.fn(),
    canvas: null,
    deleteSelection: vi.fn(),
    duplicateSelection: vi.fn(),
    nudgeSelection: vi.fn(() => true),
    redo: vi.fn(),
    undo: vi.fn(),
  };
}

it('delegates text cancellation through the canonical editing dispatcher', () => {
  const options = createOptions();

  expect(applyEditorKeyboardAction('cancel-text-edit', options)).toEqual({
    preventDefault: true,
  });
  expect(mocks.applyEditing).toHaveBeenCalledWith('cancel-text-edit', options);
});

it('owns space, history, and duplicate command dispatch', () => {
  const options = createOptions();

  expect(applyEditorKeyboardAction('space-down', options)).toEqual({
    nextSpacePressed: true,
    preventDefault: true,
  });
  expect(applyEditorKeyboardAction('undo', options)).toEqual({ preventDefault: true });
  expect(applyEditorKeyboardAction('redo', options)).toEqual({ preventDefault: true });
  expect(applyEditorKeyboardAction('duplicate-selection', options)).toEqual({
    preventDefault: true,
  });

  expect(options.undo).toHaveBeenCalledOnce();
  expect(options.redo).toHaveBeenCalledOnce();
  expect(options.duplicateSelection).toHaveBeenCalledOnce();
});

it('dispatches text styles and selection nudges through their narrow callbacks', () => {
  const options = createOptions();
  const textStyle = { command: 'bold', type: 'text-style' } as const;
  const nudge = { code: 'ArrowLeft', deltaX: -1, deltaY: 0, step: 1 } as const;

  expect(applyEditorKeyboardAction(textStyle, options)).toEqual({ preventDefault: true });
  expect(applyEditorKeyboardAction(nudge, options)).toEqual({ preventDefault: true });
  expect(options.applyTextSelectionStyle).toHaveBeenCalledWith('bold');
  expect(options.nudgeSelection).toHaveBeenCalledWith(nudge);

  const { applyTextSelectionStyle: _textStyle, ...withoutTextStyle } = options;
  const { nudgeSelection: _nudge, ...withoutNudge } = options;
  expect(applyEditorKeyboardAction(textStyle, withoutTextStyle)).toEqual({
    preventDefault: false,
  });
  expect(applyEditorKeyboardAction(nudge, withoutNudge)).toEqual({ preventDefault: false });
});

it('delegates every editing command to the editing dispatcher', () => {
  const options = createOptions();
  const actions = [
    'ignore',
    'exit-text-edit',
    'cancel-transient',
    'delete-selection',
    'apply-crop',
    'complete-draw',
    'enter-text-edit',
  ] as const;

  actions.forEach((action) => {
    expect(applyEditorKeyboardAction(action, options)).toEqual({ preventDefault: true });
  });
  expect(mocks.applyEditing).toHaveBeenCalledTimes(actions.length);
});
