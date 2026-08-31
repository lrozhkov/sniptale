import fs from 'node:fs';
import path from 'node:path';

import { expect, it } from 'vitest';

import { createTempRoot } from '../../test-support/test-helpers';
import {
  createLicenseLock,
  createLicensePolicy,
  createLicenseSbom,
  createReviewedExceptionSbom,
} from '../licenses/verify-license-audits.test-support';

function createOsvOutput() {
  return JSON.stringify({
    results: [
      {
        source: { path: 'package-lock.json', type: 'lockfile' },
        packages: [
          {
            package: { name: 'left-pad', version: '1.0.0', ecosystem: 'npm' },
            groups: [{ ids: ['OSV-1'], max_severity: '8.2' }],
            vulnerabilities: [{ id: 'OSV-1', summary: 'example high vuln' }],
          },
          {
            package: { name: 'low-pad', version: '1.0.0', ecosystem: 'npm' },
            groups: [{ ids: ['OSV-2'], max_severity: '3.2' }],
            vulnerabilities: [{ id: 'OSV-2', summary: 'example low vuln' }],
          },
        ],
      },
    ],
  });
}

function createSignatureFailureOutput() {
  return JSON.stringify({
    invalid: [
      {
        code: 'EINTEGRITYSIGNATURE',
        location: 'node_modules/bad-package',
        message: 'signature verification failed',
        name: 'bad-package',
        registry: 'https://registry.npmjs.org/',
        version: '1.0.0',
      },
    ],
    missing: [],
  });
}

it('runs npm audit signatures and reports failures', async () => {
  const module = await import('./npm-audit-signatures.mjs');
  const root = createTempRoot('verify-npm-signatures-');
  const passedReportPath = path.join(root, 'passed.json');
  const failedReportPath = path.join(root, 'failed.json');
  const passed = module.runAuditSignatures({
    reportPath: 'passed.json',
    reportRoot: root,
    runNpmImpl: (args: string[]) => {
      expect(args).toEqual(['audit', 'signatures', '--json']);
      return { status: 0, stdout: '{"invalid":[],"missing":[]}', stderr: '' };
    },
  });
  const failed = module.runAuditSignatures({
    reportPath: 'failed.json',
    reportRoot: root,
    runNpmImpl: () => ({
      status: 1,
      stdout: createSignatureFailureOutput(),
      stderr: '',
    }),
  });

  expect(passed.status).toBe('passed');
  expect(passed.detail).toContain('invalid=0; missing=0');
  expect(passed.reportPath).toBe(passedReportPath);
  expect(JSON.parse(fs.readFileSync(passedReportPath, 'utf8'))).toEqual({
    invalid: [],
    missing: [],
  });
  expect(failed.status).toBe('failed');
  expect(failed.reportPath).toBe(failedReportPath);
  expect(failed.output).toContain('bad-package');
  expect(failed.violations).toEqual([
    expect.objectContaining({
      file: 'package-lock.json',
      rule: 'npm-signature-eintegritysignature',
    }),
  ]);
});

it('maps OSV high and critical vulnerabilities to blocking violations', async () => {
  const module = await import('../osv/check.mjs');
  const root = createTempRoot('verify-osv-');
  const reportPath = path.join(root, 'osv-results.json');
  const result = module.runOsvCheck({
    executable: 'osv-scanner',
    reportPath,
    runCommandImpl: (command, args) => {
      expect(command).toBe('osv-scanner');
      expect(args).toEqual([
        'scan',
        'source',
        '-L',
        'package-lock.json',
        '-L',
        'tooling/configs/ci/npm/package-lock.json',
        '-L',
        'tooling/configs/ci/playwright/package-lock.json',
        '-L',
        'tooling/test/mutation/package-lock.json',
        '--format',
        'json',
      ]);
      return { status: 1, stdout: createOsvOutput(), stderr: '' };
    },
  });

  expect(fs.existsSync(reportPath)).toBe(true);
  expect(result.violations).toEqual([
    expect.objectContaining({
      rule: 'OSV-1',
      file: 'package-lock.json',
      message: expect.stringContaining('HIGH: left-pad@1.0.0'),
    }),
  ]);
});

it('requires OSV-Scanner instead of skipping missing CLI', async () => {
  const module = await import('../osv/check.mjs');

  expect(() => module.runOsvCheck({ executable: null })).toThrow('OSV-Scanner CLI is required');
});

it('blocks unknown licenses in strict hardfail mode', async () => {
  const module = await import('../licenses/licenses.mjs');
  const root = createTempRoot('verify-licenses-');
  const result = module.runLicenseCheck({
    policyPath: createLicensePolicy(root),
    reportPath: path.join(root, 'summary.json'),
    sbomPath: path.join(root, 'sbom.json'),
    runNpmImpl: (args: string[]) => {
      expect(args).toEqual(['sbom', '--sbom-format=cyclonedx', '--package-lock-only']);
      return { status: 0, stdout: createLicenseSbom(), stderr: '' };
    },
  });
  const report = JSON.parse(fs.readFileSync(path.join(root, 'summary.json'), 'utf8'));

  expect(result.violations).toEqual([
    expect.objectContaining({
      message: 'unknown-package@1.0.0: unknown license',
      rule: 'license-policy-unknown',
    }),
  ]);
  expect(result.summaryText).toContain('Denied license candidates: 1');
  expect(report.deniedCandidates[0].exceptionReason).toBe('tooling exception');
  expect(report.unknownComponents).toHaveLength(1);
});

it('keeps license inventory non-blocking in explicit report-only mode', async () => {
  const module = await import('../licenses/licenses.mjs');
  const root = createTempRoot('verify-licenses-report-only-');
  const result = module.runLicenseCheck({
    policyPath: createLicensePolicy(root, { mode: 'report-only' }),
    reportPath: path.join(root, 'summary.json'),
    sbomPath: path.join(root, 'sbom.json'),
    runNpmImpl: () => ({ status: 0, stdout: createLicenseSbom(), stderr: '' }),
  });

  expect(result.violations).toEqual([]);
});

it('rejects a reviewed license exception without an exact live SBOM match', async () => {
  const module = await import('../licenses/licenses.mjs');
  const root = createTempRoot('verify-licenses-stale-exception-');
  const result = module.runLicenseCheck({
    policyPath: createLicensePolicy(root, { mode: 'report-only' }),
    reportPath: path.join(root, 'summary.json'),
    sbomPath: path.join(root, 'sbom.json'),
    runNpmImpl: () => ({
      status: 0,
      stderr: '',
      stdout: JSON.stringify({
        bomFormat: 'CycloneDX',
        specVersion: '1.6',
        components: [
          {
            type: 'library',
            name: 'eslint-plugin-sonarjs',
            version: '4.2.0',
            licenses: [{ license: { id: 'MIT' } }],
          },
        ],
      }),
    }),
  });
  const report = JSON.parse(fs.readFileSync(path.join(root, 'summary.json'), 'utf8'));

  expect(result.violations).toEqual([
    expect.objectContaining({
      message: expect.stringContaining('eslint-plugin-sonarjs@4.2.0: LGPL-3.0-only'),
      rule: 'license-policy-stale-exception',
    }),
  ]);
  expect(report.staleReviewedExceptionCount).toBe(1);
  expect(report.staleReviewedExceptions).toBeUndefined();
});

it.each([
  ['runtime dependency scope', { runtime: true, developmentProperty: 'false' }],
  ['artifact inclusion', { runtime: false, developmentProperty: 'false' }],
])('rejects reviewed license exceptions widened through %s', async (_label, fixture) => {
  const module = await import('../licenses/licenses.mjs');
  const root = createTempRoot('verify-license-containment-');
  const result = module.runLicenseCheck({
    policyPath: createLicensePolicy(root),
    lockfilePath: createLicenseLock(root, fixture),
    reportPath: path.join(root, 'summary.json'),
    sbomPath: path.join(root, 'sbom.json'),
    runNpmImpl: () => ({
      status: 0,
      stderr: '',
      stdout: createReviewedExceptionSbom(fixture),
    }),
  });

  expect(result.violations).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ rule: 'license-policy' }),
      expect.objectContaining({ rule: 'license-policy-stale-exception' }),
    ])
  );
});

it('rejects a reviewed exception when npm SBOM identity matches multiple lock entries', async () => {
  const module = await import('../licenses/licenses.mjs');
  const root = createTempRoot('verify-license-ambiguous-containment-');
  const lockfilePath = createLicenseLock(root);
  const lock = JSON.parse(fs.readFileSync(lockfilePath, 'utf8'));
  lock.packages['node_modules/nested/node_modules/eslint-plugin-sonarjs'] = {
    version: '4.2.0',
    dev: true,
  };
  fs.writeFileSync(lockfilePath, JSON.stringify(lock));

  const result = module.runLicenseCheck({
    policyPath: createLicensePolicy(root),
    lockfilePath,
    reportPath: path.join(root, 'summary.json'),
    sbomPath: path.join(root, 'sbom.json'),
    runNpmImpl: () => ({
      status: 0,
      stderr: '',
      stdout: createReviewedExceptionSbom(),
    }),
  });

  expect(result.violations).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ rule: 'license-policy' }),
      expect.objectContaining({ rule: 'license-policy-stale-exception' }),
    ])
  );
});

it('binds a scoped npm11 SBOM purl to the exact reviewed lock identity', async () => {
  const module = await import('../licenses/licenses.mjs');
  const root = createTempRoot('verify-license-scoped-containment-');
  const packageName = '@scope/denied';
  const version = '1.0.0';
  const lockfilePath = path.join(root, 'package-lock.json');
  fs.writeFileSync(
    lockfilePath,
    JSON.stringify({
      lockfileVersion: 3,
      packages: {
        '': { devDependencies: { [packageName]: version } },
        'node_modules/@scope/denied': { dev: true, version },
      },
    })
  );
  const policyPath = createLicensePolicy(root, {
    reviewedExceptions: [
      {
        packageName,
        resolvedVersion: version,
        dependencyScope: 'direct-development',
        artifactInclusion: 'development-only',
        licenseExpression: 'LGPL-3.0-only',
        reason: 'scoped tooling exception',
        debtId: 'td.test.scoped-license-exception',
        approvalOwner: 'test-owner',
        expiresOn: '2099-01-01',
      },
    ],
  });
  const sbomComponent = {
    type: 'library',
    name: 'denied',
    version,
    purl: 'pkg:npm/%40scope/denied@1.0.0',
    licenses: [{ license: { id: 'LGPL-3.0-only' } }],
    properties: [{ name: 'cdx:npm:package:development', value: 'true' }],
  };
  const run = (component) =>
    module.runLicenseCheck({
      policyPath,
      lockfilePath,
      reportPath: path.join(root, `${component.purl.includes('other') ? 'spoofed' : 'exact'}.json`),
      sbomPath: path.join(root, 'sbom.json'),
      runNpmImpl: () => ({
        status: 0,
        stderr: '',
        stdout: JSON.stringify({
          bomFormat: 'CycloneDX',
          specVersion: '1.6',
          components: [component],
        }),
      }),
    });

  expect(run(sbomComponent).violations).toEqual([]);
  expect(run({ ...sbomComponent, purl: 'pkg:npm/%40scope/other@1.0.0' }).violations).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ rule: 'license-policy' }),
      expect.objectContaining({ rule: 'license-policy-stale-exception' }),
    ])
  );
});

it('rejects malformed CycloneDX component properties at the hostile-output boundary', async () => {
  const module = await import('../licenses/licenses.mjs');
  const root = createTempRoot('verify-license-malformed-properties-');
  expect(() =>
    module.runLicenseCheck({
      policyPath: createLicensePolicy(root),
      reportPath: path.join(root, 'summary.json'),
      sbomPath: path.join(root, 'sbom.json'),
      runNpmImpl: () => ({
        status: 0,
        stderr: '',
        stdout: JSON.stringify({
          bomFormat: 'CycloneDX',
          specVersion: '1.6',
          components: [
            {
              type: 'library',
              name: 'malformed',
              version: '1.0.0',
              properties: { name: 'cdx:npm:package:development', value: 'true' },
            },
          ],
        }),
      }),
    })
  ).toThrow('properties must contain string name/value pairs');
});

it('separates first-party licensing from dependency SPDX alternatives', async () => {
  const module = await import('../licenses/licenses.mjs');
  const root = createTempRoot('verify-first-party-licenses-');
  const result = module.runLicenseCheck({
    policyPath: createLicensePolicy(root, { reviewedExceptions: [] }),
    reportPath: path.join(root, 'summary.json'),
    sbomPath: path.join(root, 'sbom.json'),
    runNpmImpl: () => ({
      status: 0,
      stderr: '',
      stdout: JSON.stringify({
        bomFormat: 'CycloneDX',
        specVersion: '1.6',
        metadata: {
          component: {
            type: 'application',
            name: 'sniptale',
            version: '1.0.0',
            licenses: [{ license: { id: 'AGPL-3.0-or-later' } }],
            properties: [{ name: 'cdx:npm:package:private', value: 'true' }],
          },
        },
        components: [
          {
            type: 'application',
            name: 'extension',
            version: '1.0.0',
            licenses: [{ license: { id: 'MIT' } }],
            properties: [{ name: 'cdx:npm:package:private', value: 'true' }],
          },
          {
            type: 'library',
            name: 'dual-license-dependency',
            version: '1.0.0',
            licenses: [{ expression: '(MIT OR LGPL-3.0-only)' }],
            properties: [{ name: 'cdx:npm:package:path', value: 'node_modules/example' }],
          },
        ],
      }),
    }),
  });

  expect(result.violations).toEqual([
    expect.objectContaining({
      rule: 'license-policy-first-party',
      message: 'extension@1.0.0: MIT',
    }),
  ]);
  const report = JSON.parse(fs.readFileSync(path.join(root, 'summary.json'), 'utf8'));
  expect(report.firstPartyComponents.map((component) => component.packageName)).toEqual([
    'sniptale',
    'extension',
  ]);
});
