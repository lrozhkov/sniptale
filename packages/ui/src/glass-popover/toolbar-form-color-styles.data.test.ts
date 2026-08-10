import { describe, expect, it } from 'vitest';

import { glassPopoverToolbarFormColorStyles } from './toolbar-form-color-styles.data.ts';

describe('glassPopoverToolbarFormColorStyles', () => {
  it('keeps color trigger, palette, and hidden color wrapper selectors on the color owner', () => {
    expect(glassPopoverToolbarFormColorStyles).toContain('.sniptale-glass-color-trigger {');
    expect(glassPopoverToolbarFormColorStyles).toContain('.sniptale-glass-color-trigger--disabled');
    expect(glassPopoverToolbarFormColorStyles).toContain('.sniptale-glass-hidden-color {');
  });

  it('uses an accent border for an active color in injected toolbar styles', () => {
    const activeRule = glassPopoverToolbarFormColorStyles
      .split('.sniptale-glass-color-option--active {')[1]
      ?.split('}')[0];
    expect(activeRule).toContain('var(--sniptale-color-accent) 82%');
    expect(activeRule).not.toContain('var(--sniptale-color-text-inverse)');
  });
});
