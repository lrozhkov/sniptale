import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const toolbarShellButtonStylesheet = readFileSync(new URL('./button.css', import.meta.url), 'utf8');

describe('toolbar-shell button contract', () => {
  it('keeps toolbar button chrome on the button owner', () => {
    expect(toolbarShellButtonStylesheet).toContain('.sniptale-btn {');
    expect(toolbarShellButtonStylesheet).toContain(".sniptale-toggle[data-active='true']");
    expect(toolbarShellButtonStylesheet).toContain('.sniptale-btn-danger:hover:not(:disabled)');
  });
});
