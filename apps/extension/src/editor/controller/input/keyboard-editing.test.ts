import { describe, expect, it } from 'vitest';

import {
  resolveEditorDeleteKeyboardAction,
  resolveEditorEnterKeyboardAction,
  resolveEditorFallbackKeyboardAction,
} from './keyboard-editing';

describe('editor keyboard editing resolvers', () => {
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
