import { expect, it } from 'vitest';

import { createAdvisoryState } from './state.mjs';

it('creates deterministic bounded advisory state v2 with counts and report digest', () => {
  const finding = {
    id: 'advisory.structural-file',
    family: 'Structural file pressure',
    severity: 'watch',
    file: 'apps/extension/src/example.ts',
    line: 12,
    symbol: '<file>',
    reason: 'score=5',
    hint: 'split by owner',
  };
  const state = createAdvisoryState({
    context: {
      fingerprint: 'diff-fingerprint',
      targetFiles: ['b.ts', 'a.ts', 'b.ts'],
    },
    success: true,
    findings: [finding, finding],
    producerRunId: 'run-17',
  });

  expect(state).toMatchObject({
    version: 'agent-advisory-v2',
    success: true,
    skipped: false,
    diffFingerprint: 'diff-fingerprint',
    targetFiles: ['a.ts', 'b.ts'],
    counts: { attention: 0, watch: 1 },
    producerRunId: 'run-17',
  });
  expect(state.findings).toHaveLength(1);
  expect(state.reportDigest).toMatch(/^[a-f0-9]{64}$/u);
});

it('omits findings and zeroes counts for an explicit skipped state', () => {
  const state = createAdvisoryState({
    context: { fingerprint: 'empty', targetFiles: [] },
    success: true,
    skipped: true,
    findings: [],
  });
  expect(state.counts).toEqual({ attention: 0, watch: 0 });
  expect(state.findings).toEqual([]);
});

it('redacts bare environment secrets from every persisted source-derived field', () => {
  const key = 'SNIPTALE_ADVISORY_TEST_TOKEN';
  const secret = 'bare-advisory-private-value';
  const previous = process.env[key];
  process.env[key] = secret;
  try {
    const state = createAdvisoryState({
      context: { fingerprint: 'fingerprint', targetFiles: [`src/${secret}.ts`] },
      success: false,
      errorMessage: `failed ${secret}`,
      producerRunId: `run-${secret}`,
      findings: [
        {
          id: 'advisory.structural-file',
          family: 'Structural file pressure',
          severity: 'attention',
          file: `src/${secret}.ts`,
          symbol: secret,
          reason: secret,
          hint: secret,
        },
      ],
    });
    expect(JSON.stringify(state)).not.toContain(secret);
  } finally {
    if (previous === undefined) delete process.env[key];
    else process.env[key] = previous;
  }
});
