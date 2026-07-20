import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const overlaysCountdownStylesheet = readFileSync(
  new URL('./countdown.css', import.meta.url),
  'utf8'
);

describe('overlays.countdown contract', () => {
  it('keeps the full countdown toast shell on the canonical overlay owner', () => {
    expect(overlaysCountdownStylesheet).toContain('.sniptale-countdown-toast-container {');
    expect(overlaysCountdownStylesheet).toContain('.sniptale-countdown-toast {');
    expect(overlaysCountdownStylesheet).toContain('.sniptale-countdown-cancel {');
  });

  it('owns the pulse animation used by ProductCountdownToast', () => {
    expect(overlaysCountdownStylesheet).toContain('.sniptale-pulse {');
    expect(overlaysCountdownStylesheet).toContain('@keyframes numberPulse');
  });
});
