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
    expect(feedbackOwnerStylesheet).toContain('.sniptale-toast-exiting {');
  });
});
