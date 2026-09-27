import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const toolbarShellButtonStylesheet = readFileSync(new URL('./button.css', import.meta.url), 'utf8');
const toolbarLegacyActionsStylesheet = readFileSync(
  new URL('../toolbar/legacy-actions.css', import.meta.url),
  'utf8'
);

describe('toolbar-shell button contract', () => {
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

it('marks open menus on their indicator and gives menu triggers a compact keyboard focus', () => {
  expect(toolbarShellButtonStylesheet).toContain(
    ".sniptale-btn[data-menu-indicator='true'][aria-expanded='true']::before"
  );
  expect(toolbarShellButtonStylesheet).toContain('border-top-color: var(--sniptale-color-accent);');
  const menuFocusRule = toolbarLegacyActionsStylesheet.match(
    /\.sniptale-toolbar-root\s+\.sniptale-btn:is\([^}]+\):focus-visible \{[^}]*\}/su
  )?.[0];
  expect(menuFocusRule).toContain('outline: 2px solid var(--sniptale-color-text-primary);');
  expect(menuFocusRule).toContain('box-shadow: none;');
});
