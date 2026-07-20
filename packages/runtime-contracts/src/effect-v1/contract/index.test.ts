import { readFileSync } from 'node:fs';

import { expect, it } from 'vitest';

import {
  EFFECT_V1_SCHEMA,
  parseEffectV1Source,
  resolveEffectV1InputContract,
  validateEffectV1Document,
} from '../index';

interface InvalidValidationCase {
  document: unknown;
  expected: Array<{ code: string; path: string }>;
  id: string;
}

interface InvalidValidationCorpus {
  cases: InvalidValidationCase[];
  format: string;
}

const VALID_FIXTURES = [
  ['neutral-runtime-conformance.sniptale-effect.json', 'standalone'],
  ['neutral-standalone.sniptale-effect.json', 'standalone'],
  ['neutral-target-effect.sniptale-effect.json', 'targetEffect'],
  ['neutral-transition.sniptale-effect.json', 'transition'],
] as const;

it.each(VALID_FIXTURES)('accepts %s without warnings', (filename, expectedKind) => {
  const result = parseEffectV1Source(readFixture('valid/' + filename));

  expect(result).toEqual(
    expect.objectContaining({
      diagnostics: [],
      ok: true,
      summary: { errors: 0, warnings: 0 },
    })
  );
  expect(result.document).toEqual(
    expect.objectContaining({
      kind: expectedKind,
      schemaVersion: EFFECT_V1_SCHEMA,
    })
  );
});

it('preserves every ordered code/path projection from the invalid corpus', () => {
  const corpus = JSON.parse(
    readFixture('invalid/validation-cases.json')
  ) as InvalidValidationCorpus;

  expect(corpus.format).toBe('sniptale.effect.v1.validation-cases.v1');
  expect(corpus.cases.length).toBeGreaterThan(0);
  for (const validationCase of corpus.cases) {
    const result = validateEffectV1Document(validationCase.document);

    expect(result.ok, validationCase.id).toBe(false);
    expect(
      result.diagnostics.map(({ code, path }) => ({ code, path })),
      validationCase.id
    ).toEqual(validationCase.expected);
  }
});

it('keeps kind-specific runtime inputs exact and exclusive', () => {
  expect(resolveEffectV1InputContract('standalone')).toEqual({
    optional: [],
    required: [],
  });
  expect(resolveEffectV1InputContract('targetEffect')).toEqual({
    optional: [],
    required: ['source'],
  });
  expect(resolveEffectV1InputContract('transition')).toEqual({
    optional: [],
    required: ['from', 'to'],
  });
});
function readFixture(path: string): string {
  return readFileSync(new URL('../fixtures/' + path, import.meta.url), 'utf8');
}
