import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('keeps adjacent move and settings icons visually consistent', () => {
  const source = readFileSync(
    new URL(
      '../../../features/highlighter/frame-annotation/interaction/styles.css',
      import.meta.url
    ),
    'utf8'
  );

  for (const selector of [
    '.sniptale-callout-drag-handle > svg',
    '.sniptale-callout-settings-handle > svg',
    '.sniptale-step-badge-move-handle > svg',
    '.sniptale-step-badge-settings-handle > svg',
  ]) {
    expect(source).toContain(selector);
  }
  expect(source).toContain('width: 14px;');
  expect(source).toContain('height: 14px;');
  expect(source).toContain('stroke-width: 1.75;');
});

it('replaces the native focus outline on adjacent controls with the themed focus ring', () => {
  const source = readFileSync(
    new URL(
      '../../../features/highlighter/frame-annotation/interaction/styles.css',
      import.meta.url
    ),
    'utf8'
  );

  expect(source).toContain('.sniptale-callout-settings-handle:focus-visible,');
  expect(source).toContain('.sniptale-step-badge-settings-handle:focus-visible,');
  expect(source).toContain('outline: none !important;');
  expect(source).toContain('border-color: var(--sniptale-color-accent) !important;');
});
