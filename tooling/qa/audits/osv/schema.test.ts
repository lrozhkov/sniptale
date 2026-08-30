import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { createTempRoot } from '../../test-support/test-helpers';
import { describeOsvSchema, normalizeOsvReport, severityFromOsvGroupScore } from './schema.mjs';

function vulnerabilityResult(sourcePath: string, overrides: Record<string, unknown> = {}) {
  return {
    results: [
      {
        source: { path: sourcePath, type: 'lockfile' },
        packages: [
          {
            package: { name: 'example', version: '1.0.0', ecosystem: 'npm' },
            groups: [{ ids: ['OSV-1'], max_severity: '8.2' }],
            vulnerabilities: [{ id: 'OSV-1', summary: 'high vulnerability' }],
            ...overrides,
          },
        ],
      },
    ],
  };
}

describe('OSV group severity input', () => {
  it.each([true, [8], ' ', '-1', '10.1', '10.00000000000000001', 'NaN'])(
    'rejects coercible or out-of-range group severity %j',
    (value) => {
      expect(() => severityFromOsvGroupScore(value)).toThrow('Invalid OSV group severity');
    }
  );

  it.each([
    ['3.9', 'LOW'],
    ['4.0', 'MODERATE'],
    ['7.0', 'HIGH'],
    ['9.0', 'CRITICAL'],
  ])('classifies strict numeric string %s as %s', (value, severity) => {
    expect(severityFromOsvGroupScore(value)).toBe(severity);
  });
});

it('normalizes native absolute lock paths to the requested repository-relative identity', () => {
  const root = createTempRoot('osv-source-normalization-');
  const absoluteLock = path.join(root, 'nested/package-lock.json');
  const normalized = normalizeOsvReport(vulnerabilityResult(absoluteLock), {
    lockRoots: ['nested/package-lock.json'],
    root,
  });
  expect(normalized.results[0]?.source).toEqual({
    path: 'nested/package-lock.json',
    type: 'lockfile',
  });
});

it.each([
  ['outside source', vulnerabilityResult('/tmp/outside/package-lock.json')],
  [
    'non-lock source type',
    {
      ...vulnerabilityResult('package-lock.json'),
      results: [
        {
          ...vulnerabilityResult('package-lock.json').results[0],
          source: { path: 'package-lock.json', type: 'directory' },
        },
      ],
    },
  ],
  [
    'unknown group id',
    vulnerabilityResult('package-lock.json', {
      groups: [{ ids: ['OSV-UNKNOWN'], max_severity: '8.2' }],
    }),
  ],
  [
    'duplicate alias groups',
    vulnerabilityResult('package-lock.json', {
      groups: [
        { ids: ['OSV-1'], max_severity: '8.2' },
        { ids: ['OSV-1'], max_severity: '8.2' },
      ],
    }),
  ],
  [
    'orphaned vulnerability',
    vulnerabilityResult('package-lock.json', {
      groups: [],
    }),
  ],
] as const)('rejects %s topology', (_label, report) => {
  expect(
    describeOsvSchema(report, { lockRoots: ['package-lock.json'], root: process.cwd() })
  ).not.toBeNull();
});
