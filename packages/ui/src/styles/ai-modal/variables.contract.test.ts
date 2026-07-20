import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const aiModalVariablesStylesheet = readFileSync(
  new URL('./variables.css', import.meta.url),
  'utf8'
);

describe('ai-modal variables contract', () => {
  it('keeps modal tokens on the variables owner', () => {
    expect(aiModalVariablesStylesheet).toContain('.sniptale-ai-modal-root {');
    expect(aiModalVariablesStylesheet).toContain(
      '--sniptale-modal-bg: var(--sniptale-color-surface-overlay);'
    );
    expect(aiModalVariablesStylesheet).toContain(
      '--sniptale-input-focus-glow: var(--sniptale-color-accent-soft-strong);'
    );
  });
});
