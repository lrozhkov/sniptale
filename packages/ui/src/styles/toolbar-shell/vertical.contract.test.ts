import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const toolbarShellVerticalStylesheet = readFileSync(
  new URL('./vertical.css', import.meta.url),
  'utf8'
);

describe('toolbar-shell vertical contract', () => {
  it('keeps vertical display mode rules on the vertical owner', () => {
    expect(toolbarShellVerticalStylesheet).toContain(
      ".sniptale-toolbar[data-display-mode='vertical'] {"
    );
    expect(toolbarShellVerticalStylesheet).toContain('.sniptale-glass-toolbar-divider {');
    expect(toolbarShellVerticalStylesheet).toContain('.sniptale-toolbar-menu-item > svg,');
    expect(toolbarShellVerticalStylesheet).toContain(
      ".sniptale-toolbar[data-display-mode='vertical'] .sniptale-drag-handle svg {"
    );
    expect(toolbarShellVerticalStylesheet).toContain('transform: rotate(90deg);');
    expect(toolbarShellVerticalStylesheet).toContain(
      ".sniptale-toolbar[data-display-mode='vertical'] .sniptale-full-page-wrapper {"
    );
    expect(toolbarShellVerticalStylesheet).toContain('flex-direction: column;');
    expect(toolbarShellVerticalStylesheet).toMatch(
      /\.sniptale-full-page-wrapper \{[^}]*height: calc\(var\(--sniptale-toolbar-button-size\) \+ 12px\);/su
    );
    expect(toolbarShellVerticalStylesheet).toMatch(
      /\.sniptale-full-page-primary \{[^}]*height: var\(--sniptale-toolbar-button-size\);[^}]*border-block-end-width: 0;/su
    );
    expect(toolbarShellVerticalStylesheet).toContain(
      ".sniptale-toolbar[data-display-mode='vertical'] .sniptale-btn.sniptale-full-page-chevron svg {"
    );
    expect(toolbarShellVerticalStylesheet).toMatch(
      /\.sniptale-btn\.sniptale-full-page-chevron svg \{[^}]*width: 10px;[^}]*height: 10px;[^}]*transform: rotate\(-90deg\);/su
    );
    expect(toolbarShellVerticalStylesheet).toMatch(
      /\.sniptale-full-page-chevron \{[^}]*flex: 0 0 12px;[^}]*min-height: 12px;[^}]*height: 12px;[^}]*max-height: 12px;[^}]*border-inline-start-width: 1px;[^}]*border-block-start-width: 0;/su
    );
  });
});
