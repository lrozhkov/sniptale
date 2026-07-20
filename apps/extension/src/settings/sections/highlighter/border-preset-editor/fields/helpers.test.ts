import { describe, expect, it, vi } from 'vitest';
import { getEditorPreviewFrameClassName, getEditorStyleOptions, getPaddingLabels } from './helpers';

vi.mock('../../../../../platform/i18n', () => ({
  translate: (key: string) => key,
}));

describe('border preset editor field helpers', () => {
  it('switches preview frame class when css validation fails', () => {
    expect(getEditorPreviewFrameClassName(null)).toContain('border border');
    expect(getEditorPreviewFrameClassName('bad css')).toContain('border-2');
  });

  it('builds translated option labels and padding labels', () => {
    expect(getEditorStyleOptions()).toEqual([
      { label: 'highlighter.editor.styleSolid', value: 'solid' },
      { label: 'highlighter.editor.styleDashed', value: 'dashed' },
      { label: 'highlighter.editor.styleDotted', value: 'dotted' },
    ]);
    expect(getPaddingLabels()).toEqual({
      top: 'highlighter.editor.paddingTop',
      right: 'highlighter.editor.paddingRight',
      bottom: 'highlighter.editor.paddingBottom',
      left: 'highlighter.editor.paddingLeft',
    });
  });
});
