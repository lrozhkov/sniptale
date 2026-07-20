import { expect, expectTypeOf, it } from 'vitest';

import type { CalloutAnchor, CalloutSettings } from './callout';
import { CYRILLIC_ALPHABET, LATIN_ALPHABET } from './step-badge';
import type { StepBadgeAnchor, StepBadgeSettings } from './step-badge';

it('keeps highlighter alphabets and shared anchors canonical', () => {
  expect(CYRILLIC_ALPHABET).toHaveLength(28);
  expect(LATIN_ALPHABET).toHaveLength(26);
  expect(new Set(CYRILLIC_ALPHABET).size).toBe(CYRILLIC_ALPHABET.length);
  expect(new Set(LATIN_ALPHABET).size).toBe(LATIN_ALPHABET.length);
  expectTypeOf<CalloutAnchor>().toEqualTypeOf<StepBadgeAnchor>();
  expectTypeOf<CalloutSettings>().toMatchTypeOf<{ enabled: boolean; htmlContent: string }>();
  expectTypeOf<StepBadgeSettings>().toMatchTypeOf<{ enabled: boolean; value: string }>();
});
