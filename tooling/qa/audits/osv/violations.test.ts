import { expect, it } from 'vitest';

import { collectOsvViolations } from './violations.mjs';

function report(maxSeverity: string, databaseSeverity?: string) {
  return {
    results: [
      {
        source: { path: 'package-lock.json', type: 'lockfile' },
        packages: [
          {
            package: { name: 'example', version: '1.0.0', ecosystem: 'npm' },
            groups: [{ ids: ['GHSA-1', 'OSV-1'], max_severity: maxSeverity }],
            vulnerabilities: [
              {
                id: 'GHSA-1',
                aliases: ['OSV-1'],
                summary: 'alias member one',
                database_specific: databaseSeverity ? { severity: databaseSeverity } : undefined,
              },
              {
                id: 'OSV-1',
                aliases: ['GHSA-1'],
                summary: 'alias member two',
              },
            ],
          },
        ],
      },
    ],
  };
}

it('emits one blocking violation for one native alias group', () => {
  expect(collectOsvViolations(report('9.8'))).toEqual([
    expect.objectContaining({
      file: 'package-lock.json',
      message: expect.stringContaining('CRITICAL: example@1.0.0'),
      rule: 'GHSA-1',
    }),
  ]);
});

it('uses the highest native group or named member severity', () => {
  expect(collectOsvViolations(report('3.0', 'HIGH'))).toHaveLength(1);
});

it('keeps low and moderate native groups non-blocking', () => {
  expect(collectOsvViolations(report('6.9'))).toEqual([]);
});

it('fails closed when a native group has no classifiable severity evidence', () => {
  expect(() => collectOsvViolations(report(''))).toThrow('without classifiable native severity');
});
