import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const toolbarMenuSurfaceStylesheet = readFileSync(
  new URL('./menu-surface.css', import.meta.url),
  'utf8'
);
const designTokensStylesheet = readFileSync(
  new URL('../design-tokens.css', import.meta.url),
  'utf8'
);

describe('toolbar-menu-surface contract', () => {
  it('keeps menu container, title, and list layout on the surface owner', () => {
    expect(toolbarMenuSurfaceStylesheet).toContain('.sniptale-popover-menu {');
    expect(toolbarMenuSurfaceStylesheet).toContain('.sniptale-toolbar-menu-title {');
    expect(toolbarMenuSurfaceStylesheet).toContain('.sniptale-toolbar-menu-list {');
    expect(toolbarMenuSurfaceStylesheet).toMatch(
      /\.sniptale-popover-menu\s*\{[^}]*padding:\s*var\(--sniptale-toolbar-menu-edge-inset\);/s
    );
    expect(toolbarMenuSurfaceStylesheet).toMatch(
      /\.sniptale-toolbar-menu--compact\s*\{[^}]*padding:\s*var\(--sniptale-toolbar-menu-edge-inset\);/s
    );
    expect(designTokensStylesheet).toContain('--sniptale-toolbar-menu-edge-inset: 10px;');
  });

  it('stays focused on the menu surface instead of item chrome', () => {
    expect(toolbarMenuSurfaceStylesheet).not.toContain('.sniptale-popover-item {');
    expect(toolbarMenuSurfaceStylesheet).not.toContain('.sniptale-toolbar-menu-item-badge {');
  });

  it('does not lift backdrop effect layers above their connected frames while a menu is open', () => {
    expect(toolbarMenuSurfaceStylesheet).toMatch(/:not\(\s*\.sniptale-blur-overlay\s*\)/);
    expect(toolbarMenuSurfaceStylesheet).toMatch(/:not\(\s*\.sniptale-focus-overlay\s*\)/);
  });
});
