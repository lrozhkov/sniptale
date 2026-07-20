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
  });
});
