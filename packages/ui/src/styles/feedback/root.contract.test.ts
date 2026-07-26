import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const feedbackRootStylesheet = readFileSync(new URL('./root.css', import.meta.url), 'utf8');
const feedbackOwnerStylesheet = readFileSync(new URL('./index.css', import.meta.url), 'utf8');

describe('feedback contract', () => {
  it('keeps the root stylesheet as a thin import-only facade', () => {
    expect(feedbackRootStylesheet.trim()).toBe("@import './index.css';");
  });

  it('keeps the canonical feedback owner stylesheet as the toast owner', () => {
    expect(feedbackOwnerStylesheet).toContain('.sniptale-toast {');
    expect(feedbackOwnerStylesheet).toContain('.sniptale-toast::before {');
    expect(feedbackOwnerStylesheet).toContain('.sniptale-toast-icon-wrapper {');
    expect(feedbackOwnerStylesheet).toContain('.sniptale-toast-exiting {');
  });

  it('keeps toast feedback on an opaque canvas-backed surface', () => {
    expect(feedbackOwnerStylesheet).toContain(
      'var(--sniptale-color-surface-canvas) 94%,\n    var(--sniptale-toast-accent) 6%'
    );
    expect(feedbackOwnerStylesheet).not.toContain('var(--sniptale-color-surface-panel) 97%');
    expect(feedbackOwnerStylesheet).toContain('@media (prefers-reduced-motion: reduce)');
  });
});
