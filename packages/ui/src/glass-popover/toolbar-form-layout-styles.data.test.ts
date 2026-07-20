import { describe, expect, it } from 'vitest';

import { glassPopoverToolbarFormLayoutStyles } from './toolbar-form-layout-styles.data.ts';

describe('glassPopoverToolbarFormLayoutStyles', () => {
  it('keeps toolbar shell and toggle-row selectors on the layout owner', () => {
    expect(glassPopoverToolbarFormLayoutStyles).toContain('.sniptale-glass-toolbar {');
    expect(glassPopoverToolbarFormLayoutStyles).toContain('.sniptale-glass-toolbar-button {');
    expect(glassPopoverToolbarFormLayoutStyles).toContain('.sniptale-glass-toggle-row');
    expect(glassPopoverToolbarFormLayoutStyles).toContain('user-select: none;');
    expect(glassPopoverToolbarFormLayoutStyles).toContain('-webkit-user-select: none;');
  });
});
