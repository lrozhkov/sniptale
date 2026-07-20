import { expect, it } from 'vitest';

import { getModalBypassRules } from './design-system-rules-modal.mjs';

it('matches complete modal class tokens at the start or middle of static class names', () => {
  const [modalRule] = getModalBypassRules('/tmp/ui');
  const backdropPattern = modalRule.classPatterns[0];

  expect(backdropPattern.test('className="sniptale-modal-backdrop"')).toBe(true);
  expect(backdropPattern.test('className="fixed sniptale-modal-backdrop inset-0"')).toBe(true);
  expect(backdropPattern.test('className="not-sniptale-modal-backdrop-extra"')).toBe(false);
});
