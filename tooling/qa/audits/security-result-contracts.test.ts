import path from 'node:path';

import { expect, it } from 'vitest';

import { createTempRoot } from '../core/test-helpers';
import { runAudit } from './npm-audit.mjs';
import { runAuditSignatures } from './npm-audit-signatures.mjs';
import { runOsvCheck } from './osv.mjs';

function commandResult(status: number, stdout: string) {
  return { status, stderr: '', stdout };
}

function npmAuditResult(severity: 'moderate' | 'high', overrides = {}) {
  const counts = { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 1 };
  counts[severity] = 1;
  return JSON.stringify({
    auditReportVersion: 2,
    vulnerabilities: {
      vulnerable: {
        name: 'vulnerable',
        severity,
        isDirect: true,
        via: [{ name: 'VULN-1', title: 'example advisory', severity }],
        effects: [],
        range: '<=1.0.0',
        nodes: ['node_modules/vulnerable'],
        fixAvailable: false,
      },
    },
    metadata: { vulnerabilities: counts },
    ...overrides,
  });
}

const signatureFinding = {
  location: 'node_modules/example',
  name: 'example',
  registry: 'https://registry.npmjs.org/',
  version: '1.0.0',
};

it('rejects npm advisory records that contradict metadata or the finding exit', () => {
  const root = createTempRoot('npm-audit-result-contract-');
  expect(() =>
    runAudit({
      reportPath: 'moderate.json',
      reportRoot: root,
      runNpmImpl: () => commandResult(1, npmAuditResult('moderate')),
    })
  ).toThrow('no actionable findings');
  expect(() =>
    runAudit({
      reportPath: 'contradictory.json',
      reportRoot: root,
      runNpmImpl: () =>
        commandResult(
          1,
          npmAuditResult('high', {
            metadata: {
              vulnerabilities: {
                info: 0,
                low: 0,
                moderate: 0,
                high: 0,
                critical: 0,
                total: 1,
              },
            },
          })
        ),
    })
  ).toThrow('contradicts vulnerability records');
});

it('uses the highest npm severity evidence when a critical via exceeds its envelope', () => {
  const root = createTempRoot('npm-audit-effective-severity-');
  const output = JSON.parse(npmAuditResult('moderate'));
  output.vulnerabilities.vulnerable.via[0].severity = 'critical';

  const result = runAudit({
    reportPath: 'results.json',
    reportRoot: root,
    runNpmImpl: () => commandResult(1, JSON.stringify(output)),
  });

  expect(result.status).toBe('failed');
  expect(result.exitCode).toBe(1);
});

it('rejects partial npm advisory and signature records', () => {
  const root = createTempRoot('npm-audit-partial-records-');
  expect(() =>
    runAudit({
      reportPath: 'audit.json',
      reportRoot: root,
      runNpmImpl: () =>
        commandResult(
          1,
          JSON.stringify({
            auditReportVersion: 2,
            vulnerabilities: { vulnerable: { name: 'vulnerable', severity: 'high' } },
            metadata: {
              vulnerabilities: {
                info: 0,
                low: 0,
                moderate: 0,
                high: 1,
                critical: 0,
                total: 1,
              },
            },
          })
        ),
    })
  ).toThrow('incomplete or unclassifiable');
  expect(() =>
    runAuditSignatures({
      reportPath: 'signatures.json',
      reportRoot: root,
      runNpmImpl: () =>
        commandResult(1, JSON.stringify({ invalid: [{ name: 'partial' }], missing: [] })),
    })
  ).toThrow('invalid signature findings require');
});

it('rejects clean signature exits with findings', () => {
  const root = createTempRoot('npm-signature-clean-findings-');
  expect(() =>
    runAuditSignatures({
      reportPath: 'signatures.json',
      reportRoot: root,
      runNpmImpl: () =>
        commandResult(0, JSON.stringify({ invalid: [], missing: [signatureFinding] })),
    })
  ).toThrow('clean exit status 0');
});

it.each([
  [
    'partial package identity',
    {
      source: { path: 'package-lock.json' },
      packages: [
        {
          package: { name: 'partial' },
          vulnerabilities: [{ id: 'OSV-1', summary: 'partial package' }],
        },
      ],
    },
  ],
  [
    'unsupported severity',
    {
      source: { path: 'package-lock.json' },
      packages: [
        {
          package: { name: 'example', version: '1.0.0', ecosystem: 'npm' },
          vulnerabilities: [
            {
              id: 'OSV-2',
              summary: 'unsupported severity',
              database_specific: { severity: 'UNCLASSIFIED' },
            },
          ],
        },
      ],
    },
  ],
])('rejects OSV %s records', (_variant, result) => {
  const root = createTempRoot('osv-result-contract-');
  expect(() =>
    runOsvCheck({
      executable: 'osv-scanner',
      reportPath: path.join(root, 'osv.json'),
      runCommandImpl: () => commandResult(1, JSON.stringify({ results: [result] })),
    })
  ).toThrow();
});

it('uses the highest OSV severity across direct and related group evidence', () => {
  const root = createTempRoot('osv-severity-reconciliation-');
  const result = runOsvCheck({
    executable: 'osv-scanner',
    reportPath: path.join(root, 'osv.json'),
    runCommandImpl: () =>
      commandResult(
        1,
        JSON.stringify({
          results: [
            {
              source: { path: 'package-lock.json' },
              packages: [
                {
                  package: { name: 'example', version: '1.0.0', ecosystem: 'npm' },
                  groups: [{ ids: ['OSV-CRITICAL'], max_severity: '9.8' }],
                  vulnerabilities: [
                    {
                      id: 'OSV-CRITICAL',
                      summary: 'critical group exceeds direct classification',
                      database_specific: { severity: 'LOW' },
                    },
                  ],
                },
              ],
            },
          ],
        })
      ),
  });

  expect(result.violations).toEqual([
    expect.objectContaining({
      rule: 'OSV-CRITICAL',
      message: expect.stringContaining('CRITICAL: example@1.0.0'),
    }),
  ]);
});

it('uses CVSS vector evidence when it exceeds direct OSV severity', () => {
  const root = createTempRoot('osv-cvss-severity-reconciliation-');
  const result = runOsvCheck({
    executable: 'osv-scanner',
    reportPath: path.join(root, 'osv.json'),
    runCommandImpl: () =>
      commandResult(
        1,
        JSON.stringify({
          results: [
            {
              source: { path: 'package-lock.json' },
              packages: [
                {
                  package: { name: 'example', version: '1.0.0', ecosystem: 'npm' },
                  vulnerabilities: [
                    {
                      id: 'OSV-CVSS-CRITICAL',
                      summary: 'critical vector exceeds direct classification',
                      database_specific: { severity: 'LOW' },
                      severity: [
                        {
                          type: 'CVSS_V3',
                          score: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H',
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        })
      ),
  });

  expect(result.violations).toEqual([
    expect.objectContaining({
      rule: 'OSV-CVSS-CRITICAL',
      message: expect.stringContaining('CRITICAL: example@1.0.0'),
    }),
  ]);
});

it('treats an empty OSV group score as absent when direct severity is classified', () => {
  const root = createTempRoot('osv-empty-group-severity-');
  const result = runOsvCheck({
    executable: 'osv-scanner',
    reportPath: path.join(root, 'osv.json'),
    runCommandImpl: () =>
      commandResult(
        1,
        JSON.stringify({
          results: [
            {
              source: { path: 'package-lock.json' },
              packages: [
                {
                  package: { name: 'example', version: '1.0.0', ecosystem: 'npm' },
                  groups: [{ ids: ['OSV-LOW'], max_severity: '' }],
                  vulnerabilities: [
                    {
                      id: 'OSV-LOW',
                      summary: 'classified direct severity with no group score',
                      database_specific: { severity: 'LOW' },
                    },
                  ],
                },
              ],
            },
          ],
        })
      ),
  });

  expect(result.violations).toEqual([]);
});
