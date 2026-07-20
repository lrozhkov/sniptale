import { describe, expect, it } from 'vitest';
import { resolveEditorHistoryKeyboardAction } from './keyboard-history';

function createOptions(
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

describe('editor keyboard history resolver', () => {
  it('maps undo, redo, duplicate, and raster clipboard shortcuts', () => {
    expect(resolveEditorHistoryKeyboardAction(createOptions({ key: 'z' }))).toBe('undo');
    expect(resolveEditorHistoryKeyboardAction(createOptions({ key: 'z', shiftKey: true }))).toBe(
      'redo'
    );
    expect(
      resolveEditorHistoryKeyboardAction(createOptions({ hasSelection: true, key: 'd' }))
    ).toBe('duplicate-selection');
    expect(
      resolveEditorHistoryKeyboardAction(
        createOptions({ activeTool: 'selection', hasRasterSelection: true, key: 'x' })
      )
    ).toBe('cut-raster-selection');
    expect(resolveEditorHistoryKeyboardAction(createOptions({ code: 'KeyZ', key: 'я' }))).toBe(
      'undo'
    );
  });
});
