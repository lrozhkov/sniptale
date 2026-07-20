import { describe, expect, it } from 'vitest';

import { glassPopoverBaseStyles } from './base-styles.data.ts';
import { glassPopoverControlsStyles } from './controls-styles.data.ts';
import { glassPopoverStyles } from './styles.data.ts';
import { glassPopoverToolbarFormStyles } from './toolbar-form-styles.data.ts';

describe('glassPopoverStyles', () => {
  it('stays a thin ordered composition of base, controls, and toolbar-form owners', () => {
    expect(glassPopoverStyles).toBe(
      [glassPopoverBaseStyles, glassPopoverControlsStyles, glassPopoverToolbarFormStyles].join('\n')
    );
  });
});
