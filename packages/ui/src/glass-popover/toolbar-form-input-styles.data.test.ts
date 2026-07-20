import { describe, expect, it } from 'vitest';

import { glassPopoverToolbarFormInputStyles } from './toolbar-form-input-styles.data.ts';

describe('glassPopoverToolbarFormInputStyles', () => {
  it('keeps switch, range, input, and destructive selectors on the input owner', () => {
    expect(glassPopoverToolbarFormInputStyles).toContain('.sniptale-glass-switch {');
    expect(glassPopoverToolbarFormInputStyles).toContain('.sniptale-glass-range {');
    expect(glassPopoverToolbarFormInputStyles).toContain('.sniptale-glass-input {');
    expect(glassPopoverToolbarFormInputStyles).toContain('.sniptale-glass-destructive {');
  });

  it('does not keep hidden color wrappers after the color owner split', () => {
    expect(glassPopoverToolbarFormInputStyles).not.toContain('.sniptale-glass-hidden-color');
  });

  it('mirrors runtime glass range fill and thumb-centering contracts', () => {
    expect(glassPopoverToolbarFormInputStyles).toContain('--sniptale-range-fill-ratio: 0%;');
    expect(glassPopoverToolbarFormInputStyles).toContain('var(--sniptale-range-fill-ratio)');
    expect(glassPopoverToolbarFormInputStyles).toContain(
      'calc((var(--sniptale-range-track-height) - var(--sniptale-range-thumb-size)) / 2)'
    );
    expect(glassPopoverToolbarFormInputStyles).toContain(
      '.sniptale-glass-range::-moz-range-progress'
    );
    expect(glassPopoverToolbarFormInputStyles).toContain('transition: box-shadow 0.18s ease-out;');
    expect(glassPopoverToolbarFormInputStyles).toContain(
      '.sniptale-glass-range:hover::-webkit-slider-thumb'
    );
    expect(glassPopoverToolbarFormInputStyles).toContain(
      '.sniptale-glass-range:hover::-moz-range-thumb'
    );
    expect(glassPopoverToolbarFormInputStyles).toContain('inset 0 0 0 5px');
  });
});
