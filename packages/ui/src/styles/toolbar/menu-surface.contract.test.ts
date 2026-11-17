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
});

it('excludes injected content gating from the shared toolbar menu surface', () => {
  for (const selector of [
    ".sniptale-app:has(.sniptale-toolbar[data-menu-open='true'])",
    '.sniptale-toolbar-menu-interaction-guard',
    ".sniptale-toolbar-positioner:has(> .sniptale-toolbar[data-menu-open='true'])",
    ".sniptale-toolbar[data-menu-open='true']",
    '#sniptale-content-app-root:has(',
  ])
    expect(toolbarMenuSurfaceStylesheet).not.toContain(selector);
  expect(toolbarMenuSurfaceStylesheet).toMatch(
    /\.sniptale-main-toolbar-popover :is\(\.sniptale-modal-backdrop, \.sniptale-modal\)\s*\{[^}]*z-index:\s*2147483647\s*!important;[^}]*pointer-events:\s*auto\s*!important;/su
  );
});
