import { describe, expect, it } from 'vitest';

import { glassPopoverToolbarFormColorStyles } from './toolbar-form-color-styles.data.ts';
import { glassPopoverToolbarFormInputStyles } from './toolbar-form-input-styles.data.ts';
import { glassPopoverToolbarFormLayoutStyles } from './toolbar-form-layout-styles.data.ts';
import { glassPopoverToolbarFormStyles } from './toolbar-form-styles.data.ts';

describe('glassPopoverToolbarFormStyles', () => {
  it('stays a thin ordered composition of layout, input, and color owners', () => {
    expect(glassPopoverToolbarFormStyles).toBe(
      [
        glassPopoverToolbarFormLayoutStyles,
        glassPopoverToolbarFormInputStyles,
        glassPopoverToolbarFormColorStyles,
      ].join('\n')
    );
  });
});
