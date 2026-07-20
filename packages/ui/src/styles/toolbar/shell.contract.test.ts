import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const toolbarShellStylesheet = readFileSync(new URL('./shell.css', import.meta.url), 'utf8');
const toolbarShellVariablesStylesheet = readFileSync(
  new URL('../toolbar-shell/variables.css', import.meta.url),
  'utf8'
);
const toolbarShellLayoutStylesheet = readFileSync(
  new URL('../toolbar-shell/layout.css', import.meta.url),
  'utf8'
);
const toolbarShellButtonStylesheet = readFileSync(
  new URL('../toolbar-shell/button.css', import.meta.url),
  'utf8'
);
const toolbarShellVerticalStylesheet = readFileSync(
  new URL('../toolbar-shell/vertical.css', import.meta.url),
  'utf8'
);

describe('toolbar-shell contract', () => {
  it('stays a thin facade over the canonical toolbar-shell owner files', () => {
    expect(toolbarShellStylesheet.trim()).toBe(
      [
        "@import '../toolbar-shell/variables.css';",
        "@import '../toolbar-shell/layout.css';",
        "@import '../toolbar-shell/button.css';",
        "@import '../toolbar-shell/vertical.css';",
      ].join('\n')
    );
  });

  it('keeps toolbar shell variables on the variables owner', () => {
    expect(toolbarShellVariablesStylesheet).toContain('.sniptale-toolbar-root {');
    expect(toolbarShellVariablesStylesheet).toContain('--sniptale-toolbar-shell-height: 50px;');
    expect(toolbarShellVariablesStylesheet).toContain('--sniptale-toolbar-button-size: 36px;');
  });

  it('keeps toolbar shell chrome and layout on the layout owner', () => {
    expect(toolbarShellLayoutStylesheet).toContain('.sniptale-toolbar {');
    expect(toolbarShellLayoutStylesheet).toContain('.sniptale-drag-handle {');
    expect(toolbarShellLayoutStylesheet).toContain('.sniptale-group {');
    expect(toolbarShellLayoutStylesheet).toContain('.sniptale-spacer {');
  });

  it('keeps toolbar button chrome on the button owner', () => {
    expect(toolbarShellButtonStylesheet).toContain('.sniptale-btn {');
    expect(toolbarShellButtonStylesheet).toContain(".sniptale-toggle[data-active='true']");
    expect(toolbarShellButtonStylesheet).toContain('.sniptale-btn-danger:hover:not(:disabled)');
  });

  it('keeps vertical display mode rules on the vertical owner', () => {
    expect(toolbarShellVerticalStylesheet).toContain(
      ".sniptale-toolbar[data-display-mode='vertical'] {"
    );
    expect(toolbarShellVerticalStylesheet).toContain('.sniptale-glass-toolbar-divider {');
    expect(toolbarShellVerticalStylesheet).toContain('.sniptale-toolbar-menu-item > svg,');
  });
});
