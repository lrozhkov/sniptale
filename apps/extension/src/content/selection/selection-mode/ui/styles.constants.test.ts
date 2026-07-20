import { describe, expect, it } from 'vitest';
import { SELECTION_MODE_OVERLAY_STYLE } from './styles.constants';

describe('selection-mode overlay styles', () => {
  it('combines input, panel, and toggle rules into one overlay stylesheet', () => {
    expect(SELECTION_MODE_OVERLAY_STYLE).toContain('.sniptale-size-input');
    expect(SELECTION_MODE_OVERLAY_STYLE).toContain('.sniptale-selection-size-panel');
    expect(SELECTION_MODE_OVERLAY_STYLE).toContain('.sniptale-selection-size-toggle');
    expect(SELECTION_MODE_OVERLAY_STYLE).toContain(
      '.sniptale-selection-size-checkbox:checked::after'
    );
  });
});
