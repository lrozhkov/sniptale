import { describe, expect, it } from 'vitest';
import { resolveEditorKeyboardNudge } from './keyboard-nudge';

describe('editor keyboard nudge resolver', () => {
  it('resolves selection arrow nudges and guards modifiers or text editing', () => {
    expect(
      resolveEditorKeyboardNudge({
        altKey: false,
        code: 'ArrowLeft',
        ctrlKey: false,
        hasSelection: true,
        isEditingTextboxSelection: false,
        metaKey: false,
        shiftKey: true,
      })
    ).toEqual({ code: 'ArrowLeft', deltaX: -5, deltaY: 0, step: 5 });

    expect(
      resolveEditorKeyboardNudge({
        altKey: false,
        code: 'ArrowLeft',
        ctrlKey: true,
        hasSelection: true,
        isEditingTextboxSelection: false,
        metaKey: false,
        shiftKey: false,
      })
    ).toBeNull();
  });
});
