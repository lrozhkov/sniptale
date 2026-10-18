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

  it('gives inherited adopted status text the interface font without changing the unscoped root', () => {
    const adopted = toolbarShellVariablesStylesheet.match(
      /\.sniptale-toolbar-root\.sniptale-content-toolbar-adopted\s*\{([^}]+)\}/u
    )?.[1];
    const unscoped = toolbarShellVariablesStylesheet.match(
      /\.sniptale-toolbar-root\s*\{([^}]+)\}/u
    )?.[1];
    expect(adopted).toContain('font-family: var(--sniptale-font-interface);');
    expect(unscoped).not.toContain('font-family:');
  });
});
