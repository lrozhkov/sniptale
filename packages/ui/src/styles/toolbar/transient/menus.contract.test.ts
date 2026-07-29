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
    expect(toolbarTransientMenusStylesheet).toMatch(
      /\.sniptale-toolbar \.sniptale-full-page-primary \{[^}]*width: var\(--sniptale-toolbar-button-size\);[^}]*border-inline-end-width: 0;/su
    );
    expect(toolbarTransientMenusStylesheet).toMatch(
      /\.sniptale-toolbar \.sniptale-full-page-chevron \{[^}]*flex: 0 0 12px;[^}]*min-width: 12px;[^}]*width: 12px;[^}]*max-width: 12px;[^}]*padding: 0;[^}]*border-inline-start-width: 0;/su
    );
    expect(toolbarTransientMenusStylesheet).toMatch(
      /\.sniptale-toolbar \.sniptale-full-page-chevron svg \{[^}]*width: 10px;[^}]*height: 10px;/su
    );
    const chevronFocusRule = toolbarTransientMenusStylesheet.match(
      /\.sniptale-toolbar \.sniptale-full-page-chevron:focus-visible \{[^}]*\}/su
    )?.[0];
    expect(chevronFocusRule).toContain('border-color: transparent;');
    expect(chevronFocusRule).toContain('var(--sniptale-color-border-strong)');
    expect(chevronFocusRule).not.toContain('var(--sniptale-active-border)');
  });

  it('does not keep base popover surface or countdown shell inline', () => {
    expect(toolbarTransientMenusStylesheet).not.toContain('.sniptale-popover-menu {');
    expect(toolbarTransientMenusStylesheet).not.toContain('.sniptale-countdown-toast-container');
  });
});
