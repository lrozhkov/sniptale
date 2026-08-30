import fs from 'node:fs';
import path from 'node:path';

import { expect, it } from 'vitest';

import { createTempRoot } from '../../test-support/test-helpers';
import { runAudit } from './npm-audit.mjs';

const cleanAuditOutput = {
  auditReportVersion: 2,
  vulnerabilities: {},
  metadata: {
    vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 },
  },
};

function highAuditOutput() {
  return {
    auditReportVersion: 2,
    vulnerabilities: {
      vulnerable: {
        name: 'vulnerable',
        severity: 'high',
        isDirect: false,
        via: [{ name: 'GHSA-test', title: 'test advisory', severity: 'high' }],
        effects: [],
        range: '<=1.0.0',
        nodes: ['node_modules/vulnerable'],
        fixAvailable: false,
      },
    },
    metadata: {
      vulnerabilities: { info: 0, low: 0, moderate: 0, high: 1, critical: 0, total: 1 },
    },
  };
}

it('audits every dependency scope explicitly and accepts a clean registry result', () => {
  const root = createTempRoot('verify-npm-audit-');
  const reportPath = path.join(root, 'results.json');
  let observedArgs: string[] = [];
  const result = runAudit({
    reportPath: 'results.json',
    reportRoot: root,
    runNpmImpl: (args) => {
      observedArgs = args;
      return {
        status: 0,
        stdout: JSON.stringify({ ...cleanAuditOutput, [root]: 'repository-key' }),
        stderr: '',
      };
    },
  });

  expect(observedArgs).toEqual([
    'audit',
    '--audit-level=high',
    '--json',
    '--include=prod',
    '--include=dev',
    '--include=optional',
    '--include=peer',
  ]);
  expect(result.status).toBe('passed');
  expect(result.detail).toBe('live npm audit');
  expect(result.reportPath).toBe(reportPath);
  expect(JSON.parse(fs.readFileSync(reportPath, 'utf8'))).toMatchObject({
    auditReportVersion: 2,
    vulnerabilities: {},
    '<repo>': 'repository-key',
  });
});

it('blocks a classifiable high transitive advisory', () => {
  const root = createTempRoot('verify-npm-audit-high-');
  const result = runAudit({
    reportPath: 'results.json',
    reportRoot: root,
    runNpmImpl: () => ({ status: 1, stdout: JSON.stringify(highAuditOutput()), stderr: '' }),
  });

  expect(result.status).toBe('failed');
  expect(result.exitCode).toBe(1);
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
