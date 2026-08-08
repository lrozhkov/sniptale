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
    expect(glassPopoverControlsStylesheet).toMatch(
      /\.sniptale-glass-icon-button--active,[\s\S]*?background:\s*transparent;[\s\S]*?box-shadow:\s*none;/
    );
    expect(glassPopoverControlsStylesheet).toMatch(
      /\.sniptale-glass-icon-button--active:hover,[\s\S]*?var\(--sniptale-color-accent\) 72%[\s\S]*?color:\s*var\(--sniptale-color-accent-emphasis\);[\s\S]*?background:\s*transparent;/
    );
  });

  it('owns bounded scrolling for long preset catalogs', () => {
    expect(glassPopoverControlsStylesheet).toMatch(
      /\.sniptale-glass-preset-list--scroll\s*\{[^}]*max-height:[^}]*overflow-y:\s*auto;[^}]*overscroll-behavior:\s*contain;/s
    );
    expect(glassPopoverControlsStylesheet).not.toContain('padding-right: 4px;');
    expect(glassPopoverControlsStylesheet).not.toContain('scrollbar-gutter: stable;');
  });

  it('provides the canonical menu selection treatment for preset catalogs', () => {
    expect(glassPopoverControlsStylesheet).toContain('.sniptale-glass-preset-list--menu {');
    expect(glassPopoverControlsStylesheet).toMatch(
      /\.sniptale-glass-preset-list--menu \.sniptale-glass-preset-item\s*\{[^}]*border-color:\s*transparent;[^}]*background:\s*transparent;/s
    );
    expect(glassPopoverControlsStylesheet).toContain('.sniptale-glass-preset-check {');
  });
});
