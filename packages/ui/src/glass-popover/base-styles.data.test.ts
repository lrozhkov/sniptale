import { describe, expect, it } from 'vitest';

import { glassPopoverBaseStyles } from './base-styles.data.ts';

describe('glassPopoverBaseStyles', () => {
  it('keeps the canonical popover shell and section layout selectors', () => {
    expect(glassPopoverBaseStyles).toContain('.sniptale-glass-popover {');
    expect(glassPopoverBaseStyles).toContain('.sniptale-glass-popover--wide {');
    expect(glassPopoverBaseStyles).toContain('.sniptale-glass-popover-scroll {');
    expect(glassPopoverBaseStyles).toContain('.sniptale-glass-section {');
    expect(glassPopoverBaseStyles).toContain('user-select: none;');
    expect(glassPopoverBaseStyles).toContain('-webkit-user-select: none;');
  });
});
