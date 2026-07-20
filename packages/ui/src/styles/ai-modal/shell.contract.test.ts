import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const aiModalShellStylesheet = readFileSync(new URL('./shell.css', import.meta.url), 'utf8');

describe('ai-modal shell contract', () => {
  it('keeps modal chrome and layout on the shell owner', () => {
    expect(aiModalShellStylesheet).toContain('.sniptale-modal-backdrop {');
    expect(aiModalShellStylesheet).toContain('.sniptale-modal {');
    expect(aiModalShellStylesheet).toContain('.sniptale-modal-header {');
    expect(aiModalShellStylesheet).toContain('.sniptale-modal-body {');
    expect(aiModalShellStylesheet).toContain('.sniptale-modal-footer {');
    expect(aiModalShellStylesheet).toContain('.sniptale-modal-field-surface {');
  });

  it('keeps modal close chrome and title sizing on the shell owner', () => {
    expect(aiModalShellStylesheet).toContain('.sniptale-modal-title {');
    expect(aiModalShellStylesheet).toContain('.sniptale-modal-close {');
    expect(aiModalShellStylesheet).toContain('.sniptale-modal-close-sm {');
  });
});
