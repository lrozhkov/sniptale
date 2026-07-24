import { describe, expect, it } from 'vitest';

import {
  resolveEditorHistoryKeyboardAction,
  resolveTextStyleKeyboardAction,
} from './keyboard-shortcuts';

function createHistoryOptions(
  overrides: Partial<Parameters<typeof resolveEditorHistoryKeyboardAction>[0]>
) {
  return {
    activeTool: 'select',
    altKey: false,
    code: '',
    ctrlKey: true,
    hasRasterSelection: false,
    hasSelection: false,
    key: 'z',
    metaKey: false,
    shiftKey: false,
    ...overrides,
  };
}

describe('editor keyboard modifier shortcut resolvers', () => {
  it('maps undo, redo, duplicate, and raster clipboard shortcuts', () => {
    expect(resolveEditorHistoryKeyboardAction(createHistoryOptions({ key: 'z' }))).toBe('undo');
    expect(
      resolveEditorHistoryKeyboardAction(createHistoryOptions({ key: 'z', shiftKey: true }))
    ).toBe('redo');
    expect(
      resolveEditorHistoryKeyboardAction(createHistoryOptions({ hasSelection: true, key: 'd' }))
    ).toBe('duplicate-selection');
    expect(
      resolveEditorHistoryKeyboardAction(
        createHistoryOptions({ activeTool: 'selection', hasRasterSelection: true, key: 'x' })
      )
    ).toBe('cut-raster-selection');
    expect(
      resolveEditorHistoryKeyboardAction(createHistoryOptions({ code: 'KeyZ', key: 'я' }))
    ).toBe('undo');
  });

  it('maps supported text formatting shortcuts for active text owners', () => {
    expect(
      resolveTextStyleKeyboardAction({
        altKey: false,
        code: '',
        ctrlKey: true,
        hasSelectedTextTarget: false,
        isEditingTextboxSelection: true,
        key: 'b',
        metaKey: false,
      })
    ).toEqual({ command: 'bold', type: 'text-style' });
    expect(
      resolveTextStyleKeyboardAction({
        altKey: false,
        code: '',
        ctrlKey: false,
        hasSelectedTextTarget: true,
        isEditingTextboxSelection: false,
        key: 'u',
        metaKey: true,
      })
    ).toEqual({ command: 'underline', type: 'text-style' });
    expect(
      resolveTextStyleKeyboardAction({
        altKey: false,
        code: 'KeyB',
        ctrlKey: true,
        hasSelectedTextTarget: true,
        isEditingTextboxSelection: false,
        key: 'и',
        metaKey: false,
      })
    ).toEqual({ command: 'bold', type: 'text-style' });
  });

  it('ignores unsupported formatting shortcuts and alt-modified shortcuts', () => {
    expect(
      resolveTextStyleKeyboardAction({
        altKey: true,
        code: '',
        ctrlKey: true,
        hasSelectedTextTarget: true,
        isEditingTextboxSelection: false,
        key: 'b',
        metaKey: false,
      })
    ).toBeNull();
  });
});
