import crypto from 'node:crypto';
import fs from 'node:fs';

import { expect, it } from 'vitest';

import { isAllowedViolation, loadBaseline } from './shared-baseline.mjs';
import { createTempRoot, writeFile } from './test-helpers';

it('requires a matching content hash for baseline allowances', () => {
  const root = createTempRoot('shared-baseline-');
  const filePath = writeFile(root, 'feature.ts', 'export const value = 1;\n');
  const contentHash = crypto.createHash('sha256').update('export const value = 1;\n').digest('hex');
  const baseline = {
    allowances: [
      {
        rule: 'test-coverage-lines',
        file: filePath,
        contentHash,
      },
    ],
  };
  const violation = { rule: 'test-coverage-lines', file: filePath };

  expect(isAllowedViolation(baseline, violation)).toBe(true);

  writeFile(root, 'feature.ts', 'export const value = 2;\n');

  expect(isAllowedViolation(baseline, violation)).toBe(false);
});

it('keeps the canonical quality baseline empty', () => {
  const baseline = JSON.parse(
    fs.readFileSync('tooling/configs/qa/quality-baseline.json', 'utf8')
  ) as { allowances?: unknown[] };

  expect(baseline.allowances ?? []).toEqual([]);
});

it('ignores the retired arbitrary baseline override environment variable', () => {
  const previous = process.env.SNIPTALE_QUALITY_BASELINE_PATH;
  process.env.SNIPTALE_QUALITY_BASELINE_PATH = '/tmp/untrusted-quality-baseline.json';
  try {
    expect(loadBaseline().allowances).toEqual([]);
  } finally {
    if (previous == null) delete process.env.SNIPTALE_QUALITY_BASELINE_PATH;
    else process.env.SNIPTALE_QUALITY_BASELINE_PATH = previous;
  }
});
