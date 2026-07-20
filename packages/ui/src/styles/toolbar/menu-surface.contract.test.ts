import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const toolbarMenuSurfaceStylesheet = readFileSync(
  new URL('./menu-surface.css', import.meta.url),
  'utf8'
);

describe('toolbar-menu-surface contract', () => {
  it('keeps menu container, title, and list layout on the surface owner', () => {
    expect(toolbarMenuSurfaceStylesheet).toContain('.sniptale-popover-menu {');
    expect(toolbarMenuSurfaceStylesheet).toContain('.sniptale-toolbar-menu-title {');
    expect(toolbarMenuSurfaceStylesheet).toContain('.sniptale-toolbar-menu-list {');
  });

  it('stays focused on the menu surface instead of item chrome', () => {
    expect(toolbarMenuSurfaceStylesheet).not.toContain('.sniptale-popover-item {');
    expect(toolbarMenuSurfaceStylesheet).not.toContain('.sniptale-toolbar-menu-item-badge {');
  });
});
