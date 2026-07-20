import fs from 'node:fs';
import path from 'node:path';

import { runAstGrepCheck } from '../audits/ast-grep.mjs';
import { runGitleaksCheck } from '../audits/gitleaks.mjs';
import { runLicenseCheck } from '../audits/licenses.mjs';
import { runAudit } from '../audits/npm-audit.mjs';
import { runAuditSignatures } from '../audits/npm-audit-signatures.mjs';
import { runOsvCheck } from '../audits/osv.mjs';

function commandResult(status: number, stdout = '') {
  return { status, stderr: '', stdout };
}

function highNpmAuditResult() {
  return JSON.stringify({
    auditReportVersion: 2,
    vulnerabilities: {
      vulnerable: {
        name: 'vulnerable',
        severity: 'high',
        isDirect: true,
        via: [{ name: 'VULN-1', title: 'example advisory', severity: 'high' }],
        effects: [],
        range: '<=1.0.0',
        nodes: ['node_modules/vulnerable'],
        fixAvailable: false,
      },
    },
    metadata: {
      vulnerabilities: { info: 0, low: 0, moderate: 0, high: 1, critical: 0, total: 1 },
    },
  });
}

function createNpmCases(root: string) {
  const missingSignature = {
    location: 'node_modules/unsigned',
    name: 'unsigned',
    registry: 'https://registry.npmjs.org/',
    version: '1.0.0',
  };
  return [
    {
      id: 'npm-audit',
      run: () =>
        runAudit({
          reportPath: 'npm-audit.json',
          reportRoot: root,
          runNpmImpl: () => commandResult(0, highNpmAuditResult()),
        }),
    },
    {
      id: 'npm-audit-signatures',
      run: () =>
        runAuditSignatures({
          reportPath: 'npm-signatures.json',
          reportRoot: root,
          runNpmImpl: () =>
            commandResult(1, JSON.stringify({ invalid: [], missing: [missingSignature] })),
        }),
    },
  ];
}

function createOsvCase(root: string) {
  const output = {
    results: [
      {
        source: { path: 'package-lock.json' },
        packages: [
          {
            package: { name: 'unknown', version: '1.0.0', ecosystem: 'npm' },
            vulnerabilities: [{ id: 'OSV-UNKNOWN', summary: 'unknown severity' }],
          },
        ],
      },
    ],
  };
  return {
    id: 'osv-scanner',
    run: () =>
      runOsvCheck({
        executable: 'osv-scanner',
        reportPath: path.join(root, 'osv.json'),
        runCommandImpl: () => commandResult(1, JSON.stringify(output)),
      }),
  };
}

function createGitleaksCase(root: string) {
  const reportPath = path.join(root, 'gitleaks.json');
  const finding = {
    RuleID: 'generic-api-key',
    File: 'src/example.ts',
    StartLine: 7,
    Fingerprint: 'worktree:src/example.ts:generic-api-key:7',
  };
  return {
    id: 'gitleaks',
    run: () =>
      runGitleaksCheck({
        baselinePath: null,
        executable: 'gitleaks',
        reportPath,
        runCommandImpl: () => {
          fs.writeFileSync(reportPath, JSON.stringify([finding]));
          return commandResult(0);
        },
      }),
  };
}

function createLicenseCase(root: string) {
  const policyPath = path.join(root, 'licenses.json');
  return {
    id: 'license-inventory',
    run: () => {
      fs.writeFileSync(
        policyPath,
        JSON.stringify({
          mode: 'unknown',
          firstPartyLicense: 'AGPL-3.0-or-later',
          deniedLicenses: ['GPL-3.0-only'],
          reviewedExceptions: [],
        })
      );
      return runLicenseCheck({
        policyPath,
        reportPath: path.join(root, 'license-report.json'),
        sbomPath: path.join(root, 'sbom.json'),
        runNpmImpl: () =>
          commandResult(0, '{"bomFormat":"CycloneDX","specVersion":"1.6","components":[]}'),
      });
    },
  };
}

function createAstGrepCase() {
  const output = [
    {
      file: 'apps/extension/src/example.ts',
      ruleId: 'unexpected-rule',
      range: { start: { line: 0 } },
    },
  ];
  return {
    id: 'ast-grep',
    run: () =>
      runAstGrepCheck({
        files: ['apps/extension/src/example.ts'],
        runCommandImpl: () => commandResult(0, JSON.stringify(output)),
      }),
  };
}

export function createSecuritySemanticCases(root: string) {
  return [
    ...createNpmCases(root),
    createOsvCase(root),
    createGitleaksCase(root),
    createLicenseCase(root),
    createAstGrepCase(),
  ];
}
