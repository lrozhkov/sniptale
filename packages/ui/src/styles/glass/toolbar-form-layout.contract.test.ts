import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const glassToolbarFormLayoutStylesheet = readFileSync(
  new URL('./toolbar-form-layout.css', import.meta.url),
  'utf8'
);

describe('glass.toolbar-form-layout contract', () => {
  it('keeps toolbar shell and button chrome on the layout owner', () => {
    expect(glassToolbarFormLayoutStylesheet).toContain('.sniptale-glass-toolbar {');
    expect(glassToolbarFormLayoutStylesheet).toContain('.sniptale-glass-toolbar-button {');
    expect(glassToolbarFormLayoutStylesheet).toContain('.sniptale-glass-toolbar-divider {');
  });

  it('keeps toggle-row layout on the layout owner without swallowing form inputs', () => {
    expect(glassToolbarFormLayoutStylesheet).toContain('.sniptale-glass-toggle-row {');
    expect(glassToolbarFormLayoutStylesheet).not.toContain('.sniptale-glass-input {');
    expect(glassToolbarFormLayoutStylesheet).not.toContain('.sniptale-glass-color-trigger {');
  });
});
