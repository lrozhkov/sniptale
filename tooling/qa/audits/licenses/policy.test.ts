import { expect, it } from 'vitest';

import { parseLicensePolicy } from './policy.mjs';

const basePolicy = {
  mode: 'hardfail',
  firstPartyLicense: 'AGPL-3.0-or-later',
  deniedLicenses: ['GPL-3.0-only'],
  reviewedExceptions: [],
};

it('accepts the exact supported license policy schema', () => {
  expect(parseLicensePolicy(JSON.stringify(basePolicy))).toEqual(basePolicy);
});

it.each([
  ['', 'empty input'],
  ['{}', 'partial object'],
  [JSON.stringify({ ...basePolicy, mode: 'unknown' }), 'unknown mode'],
  [JSON.stringify({ ...basePolicy, deniedLicenses: [] }), 'empty denied list'],
  [
    JSON.stringify({ ...basePolicy, reviewedExceptions: [{ packageName: 'partial' }] }),
    'partial reviewed exception',
  ],
  [JSON.stringify({ ...basePolicy, unexpected: true }), 'unknown root field'],
  [JSON.stringify({ $comment: 1, ...basePolicy }), 'invalid comment'],
])('rejects %s (%s)', (input) => {
  expect(() => parseLicensePolicy(input)).toThrow();
});
