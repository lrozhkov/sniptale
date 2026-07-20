import { describe, expect, it } from 'vitest';

import { glassPopoverControlsStyles } from './controls-styles.data.ts';

describe('glassPopoverControlsStyles', () => {
  it('keeps generic control chrome and active contracts on the controls owner', () => {
    expect(glassPopoverControlsStyles).toContain('.sniptale-glass-icon-button,');
    expect(glassPopoverControlsStyles).toContain('.sniptale-glass-chip {');
    expect(glassPopoverControlsStyles).toContain('.sniptale-glass-preset-item {');
    expect(glassPopoverControlsStyles).toContain('.sniptale-glass-color-trigger--active');
  });
});
