import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const toolbarTransientMenusStylesheet = readFileSync(
  new URL('./menus.css', import.meta.url),
  'utf8'
);

describe('toolbar-transient-menus contract', () => {
  it('keeps menu triggers, placement animation, and viewport/capture variants on the transient owner', () => {
    expect(toolbarTransientMenusStylesheet).toContain('.sniptale-timer-wrapper,');
    expect(toolbarTransientMenusStylesheet).toContain('.sniptale-viewport-menu {');
    expect(toolbarTransientMenusStylesheet).toContain('.sniptale-popover-up {');
    expect(toolbarTransientMenusStylesheet).toContain('.sniptale-viewport-dims {');
  });

  it('does not keep base popover surface or countdown shell inline', () => {
    expect(toolbarTransientMenusStylesheet).not.toContain('.sniptale-popover-menu {');
    expect(toolbarTransientMenusStylesheet).not.toContain('.sniptale-countdown-toast-container');
  });
});
