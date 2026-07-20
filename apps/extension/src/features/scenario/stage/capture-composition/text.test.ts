import { expect, it } from 'vitest';

import { createCaptureCalloutText } from './text';

it('omits on-slide callouts for clean full-screen context slides', () => {
  expect(
    createCaptureCalloutText('Keep this in presenter notes.', 'full-screen-context')
  ).toBeNull();
});

it('compacts long step bodies into short on-slide callouts', () => {
  const body =
    'Click the scenario action while keeping the account context visible for the presenter. ' +
    'Then continue with the generated deck notes.';

  expect(createCaptureCalloutText(body, 'target-focused')).toBe(
    'Click the scenario action while keeping the account context visible for the...'
  );
});

it('falls back to word-boundary truncation when there is no short sentence', () => {
  const body =
    'Use the highlighted workspace control to continue through this intentionally long walkthrough text';

  expect(createCaptureCalloutText(body, 'click-sequence')).toBe(
    'Use the highlighted workspace control to continue through this intentionally...'
  );
});
