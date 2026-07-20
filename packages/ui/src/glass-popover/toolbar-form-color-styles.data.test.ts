import { describe, expect, it } from 'vitest';

import { glassPopoverToolbarFormColorStyles } from './toolbar-form-color-styles.data.ts';

describe('glassPopoverToolbarFormColorStyles', () => {
  it('keeps color trigger, palette, and hidden color wrapper selectors on the color owner', () => {
    expect(glassPopoverToolbarFormColorStyles).toContain('.sniptale-glass-color-trigger {');
    expect(glassPopoverToolbarFormColorStyles).toContain('.sniptale-glass-color-trigger--disabled');
    expect(glassPopoverToolbarFormColorStyles).toContain('.sniptale-glass-hidden-color {');
  });
});
