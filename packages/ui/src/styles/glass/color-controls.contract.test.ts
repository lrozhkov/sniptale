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

  it('uses the accent border instead of a theme text border for an active color', () => {
    const activeRule = glassColorControlsStylesheet
      .split('.sniptale-glass-color-option--active {')[1]
      ?.split('}')[0];
    expect(activeRule).toContain('var(--sniptale-color-accent) 82%');
    expect(activeRule).not.toContain('var(--sniptale-color-text-primary-strong)');
  });
});
