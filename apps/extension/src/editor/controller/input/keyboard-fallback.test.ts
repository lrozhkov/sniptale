import { describe, expect, it } from 'vitest';
import { resolveEditorFallbackKeyboardAction } from './keyboard-fallback';

describe('editor keyboard fallback resolver', () => {
  it('maps space, escape, and delete fallback actions', () => {
    expect(
      resolveEditorFallbackKeyboardAction({
        activeTool: 'select',
        code: 'Space',
        hasRasterSelection: false,
        hasSelection: false,
        isEditingTextboxSelection: false,
        key: ' ',
      })
    ).toBe('space-down');
    expect(
      resolveEditorFallbackKeyboardAction({
        activeTool: 'select',
        code: 'Escape',
        hasRasterSelection: false,
        hasSelection: false,
        isEditingTextboxSelection: true,
        key: 'Escape',
      })
    ).toBe('exit-text-edit');
    expect(
      resolveEditorFallbackKeyboardAction({
        activeTool: 'select',
        code: 'Delete',
        hasRasterSelection: false,
        hasSelection: true,
        isEditingTextboxSelection: false,
        key: 'Delete',
      })
    ).toBe('delete-selection');
  });
});
