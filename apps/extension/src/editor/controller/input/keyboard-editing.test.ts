import { describe, expect, it } from 'vitest';
import {
  resolveEditorDeleteKeyboardAction,
  resolveEditorEnterKeyboardAction,
  resolveEditorFallbackKeyboardAction,
} from './keyboard-editing';

describe('editor keyboard editing resolvers', () => {
  it('deletes only an existing object selection', () => {
    expect(resolveEditorDeleteKeyboardAction({ hasSelection: true, key: 'Delete' })).toBe(
      'delete-selection'
    );
    expect(resolveEditorDeleteKeyboardAction({ hasSelection: false, key: 'Backspace' })).toBeNull();
  });

  it('finishes drawing and text editing while preserving Shift+Enter', () => {
    const base = {
      hasCropGuide: false,
      hasDrawSession: false,
      hasSelectedTextTarget: false,
      isEditingTextboxSelection: false,
      key: 'Enter',
      shiftKey: false,
    };
    expect(resolveEditorEnterKeyboardAction({ ...base, hasDrawSession: true })).toBe(
      'complete-draw'
    );
    expect(resolveEditorEnterKeyboardAction({ ...base, isEditingTextboxSelection: true })).toBe(
      'exit-text-edit'
    );
    expect(
      resolveEditorEnterKeyboardAction({ ...base, isEditingTextboxSelection: true, shiftKey: true })
    ).toBeNull();
    expect(
      resolveEditorEnterKeyboardAction({
        ...base,
        isComposing: true,
        isEditingTextboxSelection: true,
      })
    ).toBeNull();
    expect(resolveEditorEnterKeyboardAction({ ...base, hasSelectedTextTarget: true })).toBe(
      'enter-text-edit'
    );
  });

  it('exits text editing before falling back to transient cancellation', () => {
    expect(
      resolveEditorFallbackKeyboardAction({
        code: 'Escape',
        hasSelection: false,
        isEditingTextboxSelection: true,
        key: 'Escape',
      })
    ).toBe('cancel-text-edit');
    expect(
      resolveEditorFallbackKeyboardAction({
        code: 'Escape',
        hasSelection: false,
        isEditingTextboxSelection: false,
        key: 'Escape',
      })
    ).toBe('cancel-transient');
  });
});
