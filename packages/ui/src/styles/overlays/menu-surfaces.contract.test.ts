import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const overlaysMenuSurfacesStylesheet = readFileSync(
  new URL('./menu-surfaces.css', import.meta.url),
  'utf8'
);

describe('overlays.menu-surfaces contract', () => {
  it('keeps dropdown and popover surfaces on the shared matte menu owner', () => {
    expect(overlaysMenuSurfacesStylesheet).toContain('.sniptale-popover-menu,');
    expect(overlaysMenuSurfacesStylesheet).toContain('.sniptale-dropdown-menu {');
    expect(overlaysMenuSurfacesStylesheet).toContain('min-width: 180px;');
    expect(overlaysMenuSurfacesStylesheet).toContain('background: transparent;');
  });

  it('keeps danger rows and popover-up placement on the canonical menu surface owner', () => {
    expect(overlaysMenuSurfacesStylesheet).toContain('.sniptale-dropdown-item.danger:hover {');
    expect(overlaysMenuSurfacesStylesheet).toContain(
      '.sniptale-dropdown-item.sniptale-popover-item-selected {'
    );
    expect(overlaysMenuSurfacesStylesheet).toContain('box-shadow: inset 0 0 0 1px');
    expect(overlaysMenuSurfacesStylesheet).toContain(
      '.sniptale-popover-menu.sniptale-popover-up {'
    );
    expect(overlaysMenuSurfacesStylesheet).toContain('bottom: calc(100% + 10px);');
  });

  it('keeps menu chrome non-selectable by default', () => {
    expect(overlaysMenuSurfacesStylesheet).toContain('.sniptale-popover-menu,');
    expect(overlaysMenuSurfacesStylesheet).toContain('.sniptale-popover-menu *,');
    expect(overlaysMenuSurfacesStylesheet).toContain('.sniptale-dropdown-menu,');
    expect(overlaysMenuSurfacesStylesheet).toContain('.sniptale-dropdown-menu * {');
    expect(overlaysMenuSurfacesStylesheet).toContain('user-select: none;');
    expect(overlaysMenuSurfacesStylesheet).toContain('-webkit-user-select: none;');
  });
});
