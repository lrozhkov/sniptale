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
      /\.sniptale-toolbar-root \.sniptale-full-page-primary \{[^}]*width: var\(--sniptale-toolbar-button-size\);[^}]*border-inline-end-width: 0;/su
    );
    expect(toolbarTransientMenusStylesheet).toMatch(
      /\.sniptale-toolbar-root \.sniptale-full-page-chevron \{[^}]*flex: 0 0 18px;[^}]*min-width: 18px;[^}]*width: 18px;[^}]*max-width: 18px;[^}]*padding: 0;[^}]*border-inline-start-width: 0;/su
    );
    expect(toolbarTransientMenusStylesheet).toMatch(
      /\.sniptale-toolbar-root \.sniptale-full-page-chevron svg \{[^}]*width: 12px;[^}]*height: 12px;/su
    );
    const chevronFocusRule = toolbarTransientMenusStylesheet.match(
      /\.sniptale-toolbar-root \.sniptale-full-page-chevron:focus-visible \{[^}]*\}/su
    )?.[0];
    expect(chevronFocusRule).toContain('border-color: transparent;');
    expect(chevronFocusRule).toContain('box-shadow: none;');
    expect(chevronFocusRule).not.toContain('var(--sniptale-active-border)');
  });

  it('does not keep base popover surface or countdown shell inline', () => {
    expect(toolbarTransientMenusStylesheet).not.toContain('.sniptale-popover-menu {');
    expect(toolbarTransientMenusStylesheet).not.toContain('.sniptale-countdown-toast-container');
  });

  it('keeps recording time in the toolbar flow without wide or empty action controls', () => {
    const statusRule = toolbarTransientMenusStylesheet.match(
      /\.sniptale-video-recording-status \{[^}]*\}/su
    )?.[0];
    expect(statusRule).toContain('position: relative;');
    expect(statusRule).not.toContain('position: absolute;');
    expect(toolbarTransientMenusStylesheet).toContain('.sniptale-video-recording-duration {');
    expect(toolbarTransientMenusStylesheet).not.toContain(
      '.sniptale-video-recording-primary-action {'
    );
    expect(toolbarTransientMenusStylesheet).not.toContain('.sniptale-video-recording-placeholder');
  });

  it('treats the full-page split action as one hover and focus surface', () => {
    expect(toolbarTransientMenusStylesheet).toMatch(
      /\.sniptale-toolbar-root \.sniptale-full-page-wrapper::after\s*\{[^}]*position:\s*absolute;[^}]*inset:\s*0;[^}]*border:\s*1px solid transparent;/su
    );
    const sharedHoverRule = toolbarTransientMenusStylesheet.match(
      /\.sniptale-toolbar-root\s+\.sniptale-full-page-wrapper:not\(\[data-active='true'\]\):hover\s+\.sniptale-btn:not\(:disabled\)\s*\{[^}]*\}/su
    )?.[0];
    expect(sharedHoverRule).toContain('background: var(--sniptale-hover-bg);');
    expect(toolbarTransientMenusStylesheet).toMatch(
      /\.sniptale-toolbar-root \.sniptale-full-page-wrapper > \.sniptale-btn\.sniptale-btn\s*\{[^}]*border-color:\s*transparent;[^}]*box-shadow:\s*none;/su
    );
    expect(sharedHoverRule).toContain('border-color: transparent;');
    const activeSharedHoverRule = toolbarTransientMenusStylesheet.match(
      /\.sniptale-toolbar-root\s+\.sniptale-full-page-wrapper\[data-active='true'\]:hover\s+\.sniptale-btn:not\(:disabled\)\s*\{[^}]*\}/su
    )?.[0];
    expect(activeSharedHoverRule).toContain('color: var(--sniptale-color-accent-emphasis);');
    expect(toolbarTransientMenusStylesheet).toMatch(
      /\.sniptale-toolbar-root\s+\.sniptale-full-page-wrapper\[data-active='true'\]:has\(\.sniptale-btn:not\(:disabled\)\):hover::after/su
    );
    expect(toolbarTransientMenusStylesheet).toMatch(
      /\.sniptale-toolbar-root\s+\.sniptale-full-page-wrapper:not\(\[data-active='true'\]\):has\(\s*\.sniptale-btn:not\(:disabled\)\s*\):hover::after/su
    );
    expect(toolbarTransientMenusStylesheet).toMatch(
      /\.sniptale-toolbar-root\s+\.sniptale-full-page-wrapper:has\(\s*\.sniptale-full-page-chevron\[aria-expanded='true'\],\s*\.sniptale-btn:focus-visible\s*\)::after/su
    );
    expect(toolbarTransientMenusStylesheet).toMatch(
      /\.sniptale-toolbar-root\s+\.sniptale-full-page-wrapper:has\(\.sniptale-btn:focus-visible\)\s+\.sniptale-btn\s*\{[^}]*box-shadow:\s*none;/su
    );
    expect(toolbarTransientMenusStylesheet).not.toContain(
      '.sniptale-full-page-wrapper:focus-within'
    );
  });
});
