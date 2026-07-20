import { expect, it } from 'vitest';

import { shouldSendFrameDrivenProgress } from './progress';

it('keeps frame-driven progress on the final frame and at the configured cadence', () => {
  expect(shouldSendFrameDrivenProgress(0, -1, 6, 6)).toBe(false);
  expect(shouldSendFrameDrivenProgress(1, -1, 6, 6)).toBe(true);
  expect(shouldSendFrameDrivenProgress(2, -1, 6, 6)).toBe(true);
  expect(shouldSendFrameDrivenProgress(5, 2, 6, 6)).toBe(true);
});
