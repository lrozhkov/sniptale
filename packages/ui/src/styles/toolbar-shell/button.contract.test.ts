import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const toolbarShellButtonStylesheet = readFileSync(new URL('./button.css', import.meta.url), 'utf8');
const toolbarLegacyActionsStylesheet = readFileSync(
  new URL('../toolbar/legacy-actions.css', import.meta.url),
  'utf8'
);

describe('toolbar-shell button contract', () => {
  it('shares annotation effect accents and compound menu geometry without changing recording selectors', () => {
    expect(toolbarShellButtonStylesheet).toContain(
      ".sniptale-annotation-effect-options > button[aria-pressed='true']"
    );
    expect(toolbarShellButtonStylesheet).toContain(
      'border-color: var(--sniptale-color-accent) !important;'
    );
    expect(toolbarShellButtonStylesheet).toContain(
      ':is(.sniptale-recording-media-control, .sniptale-toolbar-split-control)'
    );
    expect(toolbarShellButtonStylesheet).toContain('.sniptale-annotation-properties-arrow');
  });
  it('keeps toolbar button chrome on the button owner', () => {
    expect(toolbarShellButtonStylesheet).toContain('.sniptale-btn {');
    expect(toolbarShellButtonStylesheet).toContain(".sniptale-toggle[data-active='true']");
    expect(toolbarShellButtonStylesheet).toContain('.sniptale-btn-danger:hover:not(:disabled)');
    expect(toolbarShellButtonStylesheet).toContain('.sniptale-split-action {');
    expect(toolbarShellButtonStylesheet).not.toContain('.sniptale-split-action-end::before {');
    expect(toolbarShellButtonStylesheet).toMatch(
      /\.sniptale-toggle\[data-active='true'\],[\s\S]*?background:\s*transparent;[\s\S]*?box-shadow:\s*none;/
    );
  });
});

it('keeps compact popover headings separate from structural dialog headings', () => {
  const title = toolbarShellButtonStylesheet.match(
    /\.sniptale-content-menu-adopted\.sniptale-toolbar-menu \.sniptale-toolbar-menu-title\s*\{([^}]+)\}/u
  )?.[1];
  expect(title).toContain('font: 500 12px / 16px var(--sniptale-font-interface);');
  expect(title).toContain('color: var(--sniptale-color-text-secondary);');
  expect(title).toContain('text-transform: none;');
  expect(title).toContain('letter-spacing: normal;');
});

it('marks open menus on their indicator and gives menu triggers a compact keyboard focus', () => {
  expect(toolbarShellButtonStylesheet).toContain(
    ".sniptale-btn[data-menu-indicator='true'][aria-expanded='true']::before"
  );
  expect(toolbarShellButtonStylesheet).toContain('border-top-color: var(--sniptale-color-accent);');
  const menuFocusRule = toolbarLegacyActionsStylesheet.match(
    /\.sniptale-toolbar-root\s+\.sniptale-btn:is\([^}]+\):focus-visible:not\(\[data-focus-restoration='pointer'\]\) \{[^}]*\}/su
  )?.[0];
  expect(menuFocusRule).toContain('outline: 2px solid var(--sniptale-color-text-primary);');
  expect(menuFocusRule).toContain('box-shadow: none;');
});
