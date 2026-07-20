import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const overlaysModalShellStylesheet = readFileSync(
  new URL('./modal-shell.css', import.meta.url),
  'utf8'
);

describe('overlays.modal-shell contract', () => {
  it('keeps the matte modal backdrop and panel surface on the canonical modal-shell owner', () => {
    expect(overlaysModalShellStylesheet).toContain('.sniptale-modal-backdrop {');
    expect(overlaysModalShellStylesheet).toContain('var(--sniptale-color-overlay) 76%,');
    expect(overlaysModalShellStylesheet).toContain('.sniptale-modal {');
    expect(overlaysModalShellStylesheet).toContain(
      'background: color-mix(in srgb, var(--sniptale-color-surface-panel) 99%, transparent);'
    );
  });

  it('stays a true modal-shell owner instead of keeping save-dialog or ai-badge styling inline', () => {
    expect(overlaysModalShellStylesheet).not.toContain('.sniptale-save-dialog-section {');
    expect(overlaysModalShellStylesheet).not.toContain('.sniptale-save-dialog-icon-badge {');
    expect(overlaysModalShellStylesheet).not.toContain('.sniptale-ai-icon-badge');
  });

  it('keeps the close action on the softer matte borderless contract', () => {
    expect(overlaysModalShellStylesheet).toContain('.sniptale-modal-close {');
    expect(overlaysModalShellStylesheet).toContain('border: none;');
  });

  it('keeps modal chrome non-selectable while leaving editable descendants alone', () => {
    expect(overlaysModalShellStylesheet).toContain('.sniptale-modal,');
    expect(overlaysModalShellStylesheet).toContain('.sniptale-modal * {');
    expect(overlaysModalShellStylesheet).toContain('user-select: none;');
    expect(overlaysModalShellStylesheet).toContain('-webkit-user-select: none;');
    expect(overlaysModalShellStylesheet).toContain(
      '.sniptale-modal :is(input, textarea, select, [contenteditable]),'
    );
    expect(overlaysModalShellStylesheet).toContain('.sniptale-modal [contenteditable] * {');
    expect(overlaysModalShellStylesheet).toContain('user-select: text;');
  });
});
