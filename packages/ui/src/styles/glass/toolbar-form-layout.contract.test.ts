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
    expect(glassToolbarFormLayoutStylesheet).toContain('.sniptale-glass-toolbar-button:disabled {');
    expect(glassToolbarFormLayoutStylesheet).toContain('.sniptale-glass-toolbar-divider {');
    expect(glassToolbarFormLayoutStylesheet).toMatch(
      /\.sniptale-glass-toolbar-button--active\s*\{[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;/s
    );
    expect(glassToolbarFormLayoutStylesheet).toMatch(
      /\.sniptale-glass-toolbar-button\.sniptale-glass-toolbar-button--active:hover:not\(:disabled\)\s*\{[^}]*color:\s*var\(--sniptale-color-accent-emphasis\);[^}]*background:\s*transparent;/s
    );
  });

  it('keeps toggle-row layout on the layout owner without swallowing form inputs', () => {
    expect(glassToolbarFormLayoutStylesheet).toContain('.sniptale-glass-toggle-row {');
    expect(glassToolbarFormLayoutStylesheet).not.toContain('.sniptale-glass-input {');
    expect(glassToolbarFormLayoutStylesheet).not.toContain('.sniptale-glass-color-trigger {');
  });
});

it('aligns content action toolbars with the main toolbar control geometry', () => {
  const selector =
    ':host .sniptale-glass-toolbar:is(.sniptale-action-toolbar, .sniptale-callout-format-toolbar) {';
  const block = glassToolbarFormLayoutStylesheet
    .slice(glassToolbarFormLayoutStylesheet.indexOf(selector))
    .split('}')[0];
  expect(block).toContain('border-radius: 4px');
  expect(glassToolbarFormLayoutStylesheet.replace(/\s+/gu, ' ')).toContain(
    ':host :is(.sniptale-action-toolbar, .sniptale-callout-format-toolbar) .sniptale-glass-toolbar-button'
  );
  expect(glassToolbarFormLayoutStylesheet).toContain('width: 32px');
});
