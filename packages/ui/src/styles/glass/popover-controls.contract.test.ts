import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const glassPopoverControlsStylesheet = readFileSync(
  new URL('./popover-controls.css', import.meta.url),
  'utf8'
);

describe('glass.popover-controls contract', () => {
  it('keeps glass button, chip, and preset contracts on the shared controls owner', () => {
    expect(glassPopoverControlsStylesheet).toContain('.sniptale-glass-icon-button,');
    expect(glassPopoverControlsStylesheet).toContain('.sniptale-glass-chip {');
    expect(glassPopoverControlsStylesheet).toContain('.sniptale-glass-option-grid {');
    expect(glassPopoverControlsStylesheet).toContain('.sniptale-glass-preset-item {');
  });

  it('keeps active accent treatment on the shared controls owner', () => {
    expect(glassPopoverControlsStylesheet).toContain('.sniptale-glass-icon-button--active,');
    expect(glassPopoverControlsStylesheet).toContain(
      'background: color-mix(in srgb, var(--sniptale-color-accent) 8%, transparent);'
    );
  });
});
