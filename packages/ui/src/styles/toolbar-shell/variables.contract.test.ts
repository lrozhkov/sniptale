import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const toolbarShellVariablesStylesheet = readFileSync(
  new URL('./variables.css', import.meta.url),
  'utf8'
);

describe('toolbar-shell variables contract', () => {
  it('keeps toolbar shell tokens on the variables owner', () => {
    expect(toolbarShellVariablesStylesheet).toContain('.sniptale-toolbar-root {');
    expect(toolbarShellVariablesStylesheet).toContain('--sniptale-toolbar-shell-height: 50px;');
    expect(toolbarShellVariablesStylesheet).toContain('--sniptale-toolbar-button-size: 36px;');
  });
});
