import { expect, it } from 'vitest';

import { QUALITY_LIMITS } from '../../../../policy/quality/quality.config.mjs';
import { collectOversizedInlineLiteralViolations } from './check.mjs';

const atLimit = 'x'.repeat(QUALITY_LIMITS.maxGeneratedDataLineLength);
const overLimit = `${atLimit}x`;

it('blocks oversized strings and no-substitution templates', () => {
  expect(
    collectOversizedInlineLiteralViolations(
      'apps/extension/src/example.ts',
      `export const first = ${JSON.stringify(overLimit)}; export const second = \`${overLimit}\`;`
    )
  ).toHaveLength(2);
});

it('allows the exact threshold and interpolated templates', () => {
  expect(
    collectOversizedInlineLiteralViolations(
      'apps/extension/src/example.ts',
      `export const first = ${JSON.stringify(atLimit)}; export const second = \`${overLimit}\${value}\`;`
    )
  ).toEqual([]);
});

it('allows classified data carriers to own long literals', () => {
  expect(
    collectOversizedInlineLiteralViolations(
      'apps/extension/src/example.data.ts',
      `export const fixture = ${JSON.stringify(overLimit)};`
    )
  ).toEqual([]);
});
