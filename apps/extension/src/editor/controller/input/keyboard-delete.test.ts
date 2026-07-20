import { describe, expect, it } from 'vitest';
import { resolveEditorDeleteKeyboardAction } from './keyboard-delete';

describe('editor keyboard delete resolver', () => {
  it('routes active raster selection deletion before object selection deletion', () => {
    expect(
      resolveEditorDeleteKeyboardAction({
        activeTool: 'selection',
        hasRasterSelection: true,
        hasSelection: true,
        key: 'Delete',
      })
    ).toBe('delete-raster-selection');
    expect(
      resolveEditorDeleteKeyboardAction({
        activeTool: 'select',
        hasRasterSelection: true,
        hasSelection: true,
        key: 'Backspace',
      })
    ).toBe('delete-selection');
  });
});
