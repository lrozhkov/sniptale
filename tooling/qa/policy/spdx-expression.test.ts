import { expect, it } from 'vitest';

import { evaluateSpdxExpression } from './spdx-expression.mjs';

it('evaluates complete SPDX boolean expressions instead of accepting a denied token prefix', () => {
  expect(evaluateSpdxExpression('MIT OR GPL-3.0-only', ['GPL-3.0-only'])).toMatchObject({
    allowed: true,
    deniedLicenses: ['GPL-3.0-only'],
  });
  expect(evaluateSpdxExpression('MIT AND GPL-3.0-only', ['GPL-3.0-only'])).toMatchObject({
    allowed: false,
    deniedLicenses: ['GPL-3.0-only'],
  });
});

it('fails closed for malformed SPDX expressions', () => {
  expect(evaluateSpdxExpression('MIT OR (GPL-3.0-only', ['GPL-3.0-only'])).toBeNull();
});
