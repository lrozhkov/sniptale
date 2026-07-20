import { describe, expect, it } from 'vitest';
import { resolveEditorEnterKeyboardAction } from './keyboard-enter';

describe('editor keyboard enter resolver', () => {
  it('prioritizes draw completion, text editing, then crop apply for Enter', () => {
    expect(
      resolveEditorEnterKeyboardAction({
        hasCropGuide: true,
        hasDrawSession: true,
        hasSelectedTextTarget: true,
        key: 'Enter',
      })
    ).toBe('complete-draw');
    expect(
      resolveEditorEnterKeyboardAction({
        hasCropGuide: true,
        hasSelectedTextTarget: true,
        key: 'Enter',
      })
    ).toBe('enter-text-edit');
    expect(resolveEditorEnterKeyboardAction({ hasCropGuide: true, key: 'Enter' })).toBe(
      'apply-crop'
    );
  });
});
