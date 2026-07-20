import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { createTempRoot } from '../../core/test-helpers';
import { runOsvCheck } from '../osv.mjs';
import { severityFromOsvGroupScore } from './severity.mjs';

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

it('rejects malformed group severity through the OSV adapter schema', () => {
  const root = createTempRoot('osv-malformed-group-severity-');
  expect(() =>
    runOsvCheck({
      executable: 'osv-scanner',
      reportPath: path.join(root, 'osv.json'),
      runCommandImpl: () => ({
        status: 1,
        stderr: '',
        stdout: JSON.stringify({
          results: [
            {
              source: { path: 'package-lock.json' },
              packages: [
                {
                  package: { name: 'example', version: '1.0.0', ecosystem: 'npm' },
                  groups: [{ ids: ['OSV-MALFORMED'], max_severity: true }],
                  vulnerabilities: [{ id: 'OSV-MALFORMED', summary: 'malformed group severity' }],
                },
              ],
            },
          ],
        }),
      }),
    })
  ).toThrow('invalid group');
});
