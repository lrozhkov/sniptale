import fs from 'node:fs';
import path from 'node:path';

import { expect, it } from 'vitest';

import { createTempRoot } from './test-helpers';
import { runAudit } from './verify-audit.mjs';

it('passes verify-audit immediately when live npm audit succeeds', () => {
  const root = createTempRoot('verify-npm-audit-');
  const reportPath = path.join(root, 'results.json');
  const result = runAudit({
    reportPath: 'results.json',
    reportRoot: root,
    runNpmImpl: () => ({
      status: 0,
      stdout: JSON.stringify({
        auditReportVersion: 2,
        vulnerabilities: {},
        metadata: {
          vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 },
        },
        [root]: 'repository-key',
      }),
      stderr: '',
    }),
  });

  expect(result.status).toBe('passed');
  expect(result.detail).toBe('live npm audit');
  expect(result.reportPath).toBe(reportPath);
  expect(JSON.parse(fs.readFileSync(reportPath, 'utf8'))).toMatchObject({
    auditReportVersion: 2,
    vulnerabilities: {},
    '<repo>': 'repository-key',
  });
});

it('fails verify-audit when live npm audit returns a network error', () => {
  const root = createTempRoot('verify-npm-audit-network-');
  expect(() =>
    runAudit({
      reportPath: 'results.json',
      reportRoot: root,
      runNpmImpl: () => ({
        status: 1,
        stdout: '',
        stderr: 'network timeout',
      }),
    })
  ).toThrow('stdout is required');
});

it('fails verify-audit when invoking npm audit throws', () => {
  const root = createTempRoot('verify-npm-audit-bootstrap-');
  expect(() =>
    runAudit({
      reportPath: 'results.json',
      reportRoot: root,
      runNpmImpl: () => {
        throw new Error('spawn npm ENOENT');
      },
    })
  ).toThrow('npm audit failed to start: spawn npm ENOENT');
});
