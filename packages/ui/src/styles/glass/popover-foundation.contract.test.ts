import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const glassPopoverFoundationStylesheet = readFileSync(
  new URL('./popover-foundation.css', import.meta.url),
  'utf8'
);

describe('glass.popover-foundation contract', () => {
  it('keeps popover shell and section layout on the foundation owner', () => {
    expect(glassPopoverFoundationStylesheet).toContain('.sniptale-glass-popover {');
    expect(glassPopoverFoundationStylesheet).toContain('.sniptale-glass-section {');
    expect(glassPopoverFoundationStylesheet).toContain('.sniptale-glass-arrow-grid {');
  });

  it('stays a true foundation owner instead of keeping control chrome inline', () => {
    expect(glassPopoverFoundationStylesheet).not.toContain('.sniptale-glass-icon-button {');
    expect(glassPopoverFoundationStylesheet).not.toContain('.sniptale-glass-preset-item {');
    expect(glassPopoverFoundationStylesheet).not.toContain('.sniptale-glass-color-trigger');
    expect(glassPopoverFoundationStylesheet).not.toContain('.sniptale-glass-option-grid {');
  });

  it('keeps glass popovers non-selectable while restoring editable seams', () => {
    expect(glassPopoverFoundationStylesheet).toContain('.sniptale-glass-popover,');
    expect(glassPopoverFoundationStylesheet).toContain('.sniptale-glass-popover * {');
    expect(glassPopoverFoundationStylesheet).toContain('user-select: none;');
    expect(glassPopoverFoundationStylesheet).toContain('-webkit-user-select: none;');
    expect(glassPopoverFoundationStylesheet).toContain(
      '.sniptale-glass-popover :is(input, textarea, select, [contenteditable]),'
    );
    expect(glassPopoverFoundationStylesheet).toContain(
      '.sniptale-glass-popover [contenteditable] * {'
    );
    expect(glassPopoverFoundationStylesheet).toContain('user-select: text;');
  });
});
