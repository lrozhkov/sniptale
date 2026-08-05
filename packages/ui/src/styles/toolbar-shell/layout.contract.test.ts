import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const toolbarShellLayoutStylesheet = readFileSync(new URL('./layout.css', import.meta.url), 'utf8');

describe('toolbar-shell layout contract', () => {
  it('keeps toolbar chrome and shell layout on the layout owner', () => {
    expect(toolbarShellLayoutStylesheet).toContain('.sniptale-toolbar {');
    expect(toolbarShellLayoutStylesheet).toContain('.sniptale-drag-handle {');
    expect(toolbarShellLayoutStylesheet).toContain('.sniptale-group {');
    expect(toolbarShellLayoutStylesheet).toContain('.sniptale-toolbar-subgroup {');
    expect(toolbarShellLayoutStylesheet).toContain('.sniptale-toolbar-annotation-group,');
    expect(toolbarShellLayoutStylesheet).toContain('.sniptale-toolbar-privacy-group-start {');
    expect(toolbarShellLayoutStylesheet).toContain('.sniptale-mode-selector-group');
    expect(toolbarShellLayoutStylesheet).toContain('.sniptale-capture-leading-divider {');
    expect(toolbarShellLayoutStylesheet).toContain('.sniptale-spacer {');
  });
});
