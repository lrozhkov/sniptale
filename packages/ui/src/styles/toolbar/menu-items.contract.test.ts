import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const toolbarMenuItemsStylesheet = readFileSync(
  new URL('./menu-items.css', import.meta.url),
  'utf8'
);

describe('toolbar-menu-items contract', () => {
  it('keeps selectable menu rows, copy, and badge chrome on the items owner', () => {
    expect(toolbarMenuItemsStylesheet).toContain('.sniptale-popover-item {');
    expect(toolbarMenuItemsStylesheet).toContain('.sniptale-popover-item-selected {');
    expect(toolbarMenuItemsStylesheet).toContain('.sniptale-toolbar-menu-item-badge {');
    expect(toolbarMenuItemsStylesheet).toContain('.sniptale-popover-divider {');
  });

  it('does not keep menu-surface or countdown ownership inline', () => {
    expect(toolbarMenuItemsStylesheet).not.toContain('.sniptale-popover-menu {');
    expect(toolbarMenuItemsStylesheet).not.toContain('.sniptale-countdown-toast {');
  });
});
