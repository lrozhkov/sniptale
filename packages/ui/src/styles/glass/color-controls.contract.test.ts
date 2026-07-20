import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const glassColorControlsStylesheet = readFileSync(
  new URL('./color-controls.css', import.meta.url),
  'utf8'
);

describe('glass.color-controls contract', () => {
  it('keeps color field layout, trigger, and palette selectors on the color owner', () => {
    expect(glassColorControlsStylesheet).toContain('.sniptale-glass-color-row {');
    expect(glassColorControlsStylesheet).toContain('.sniptale-glass-color-trigger {');
    expect(glassColorControlsStylesheet).toContain('.sniptale-glass-color-option {');
  });

  it('supports the runtime disabled class contract used by ProductGlassControls', () => {
    expect(glassColorControlsStylesheet).toContain('.sniptale-glass-color-trigger--disabled,');
    expect(glassColorControlsStylesheet).toContain('.sniptale-glass-hidden-color {');
  });
});
