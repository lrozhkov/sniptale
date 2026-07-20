import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const glassStepBadgeStylesheet = readFileSync(new URL('./step-badge.css', import.meta.url), 'utf8');

describe('glass.step-badge contract', () => {
  it('keeps step-badge-only selectors on the dedicated owner', () => {
    expect(glassStepBadgeStylesheet).toContain('.sniptale-step-badge-anchor-dot {');
    expect(glassStepBadgeStylesheet).toContain('.sniptale-step-badge-chip {');
    expect(glassStepBadgeStylesheet).toContain('.sniptale-step-badge-input {');
  });
});
