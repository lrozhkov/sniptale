import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const toolbarShellLayoutStylesheet = readFileSync(new URL('./layout.css', import.meta.url), 'utf8');

describe('toolbar-shell layout contract', () => {
  it('keeps toolbar chrome and shell layout on the layout owner', () => {
    expect(toolbarShellLayoutStylesheet).toContain('.sniptale-toolbar {');
    expect(toolbarShellLayoutStylesheet).toContain('.sniptale-drag-handle {');
    expect(toolbarShellLayoutStylesheet).toContain('.sniptale-group {');
    expect(toolbarShellLayoutStylesheet).toContain('.sniptale-spacer {');
  });
});
