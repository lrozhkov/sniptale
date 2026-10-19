import { describe, expect, it } from 'vitest';
import { SELECTION_MODE_OVERLAY_STYLE } from './styles.constants';

describe('selection-mode overlay styles', () => {
  it('insets both mode visuals within one continuous neutral backing', () => {
    expect(SELECTION_MODE_OVERLAY_STYLE).toContain('gap: 0;');
    expect(SELECTION_MODE_OVERLAY_STYLE).toContain('padding: 2px;');
    expect(SELECTION_MODE_OVERLAY_STYLE).toContain('background-clip: content-box;');
  });

  it('combines input, panel, and toggle rules into one overlay stylesheet', () => {
    expect(SELECTION_MODE_OVERLAY_STYLE).toContain('.sniptale-size-input');
    expect(SELECTION_MODE_OVERLAY_STYLE).toContain('.sniptale-selection-size-panel');
    expect(SELECTION_MODE_OVERLAY_STYLE).toContain('.sniptale-selection-size-toggle');
    expect(SELECTION_MODE_OVERLAY_STYLE).toContain(
      '.sniptale-selection-size-checkbox:checked::after'
    );
  });
});
