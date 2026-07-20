import fs from 'node:fs';
import path from 'node:path';

import { expect, it } from 'vitest';

import { runAstGrepCheck } from '../audits/ast-grep.mjs';
import { runCodeqlCheck } from '../audits/codeql.mjs';
import { runGitleaksCheck } from '../audits/gitleaks.mjs';
import { runJscpdCheck } from '../audits/jscpd.mjs';
import { runKnipCheck } from '../audits/knip.mjs';
import { runLicenseCheck } from '../audits/licenses.mjs';
import { runAudit } from '../audits/npm-audit.mjs';
import { runAuditSignatures } from '../audits/npm-audit-signatures.mjs';
import { runOsvCheck } from '../audits/osv.mjs';
import { runSemgrepCheck } from '../audits/semgrep.mjs';
import { AUDIT_STEPS } from './qa-steps/definitions.data.mjs';
import { createTempRoot } from './test-helpers';

type CommandStatus = number | null | undefined;

const INTERNAL_AUDIT_CONTROL_IDS = new Set([
  'audit-evidence',
  'full-product-coverage',
  'topology-report',
]);
const npmAuditClean = JSON.stringify({
  auditReportVersion: 2,
  vulnerabilities: {},
  metadata: {
    vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 },
  },
});

function writeOutput(file: string, output: string | undefined) {
  if (output === undefined) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, output);
}

function commandResult(status: CommandStatus, stdout = '') {
  return { status, stderr: '', stdout };
}

function createNpmCases(root: string) {
  return [
    {
      id: 'npm-audit',
      findingExit: true,
      validJson: npmAuditClean,
      invalidJson: '{"auditReportVersion":2,"vulnerabilities":{},"metadata":{}}',
      run: (status: CommandStatus, output?: string) =>
        runAudit({ cwd: root, runNpmImpl: () => commandResult(status, output) }),
    },
    {
      id: 'npm-audit-signatures',
      findingExit: true,
      validJson: '{"invalid":[],"missing":[]}',
      invalidJson: '{"invalid":[]}',
      run: (status: CommandStatus, output?: string) =>
        runAuditSignatures({ cwd: root, runNpmImpl: () => commandResult(status, output) }),
    },
  ];
}

function createFileReportCase({ id, reportPath, validJson, invalidJson, run }) {
  return {
    id,
    findingExit: true,
    validJson,
    invalidJson,
    run(status: CommandStatus, output?: string) {
      return run(status, () => writeOutput(reportPath, output));
    },
  };
}

function createCodeqlCase(root: string) {
  const outputRoot = path.join(root, 'codeql');
  const sarifPath = path.join(outputRoot, 'results.sarif');
  return {
    id: 'codeql',
    findingExit: false,
    validJson: '{"version":"2.1.0","runs":[{"results":[]}]}',
    invalidJson: '{"version":"2.1.0","runs":[{}]}',
    run(status: CommandStatus, output?: string) {
      return runCodeqlCheck({
        baselinePath: null,
        executable: 'codeql',
        outputRoot,
        runCommandImpl: (_command, args) => {
          if (args[1] === 'create') return commandResult(0);
          writeOutput(sarifPath, output);
          return commandResult(status);
        },
      });
    },
  };
}

function createOsvCase(root: string) {
  return {
    id: 'osv-scanner',
    findingExit: true,
    validJson: '{"results":[]}',
    invalidJson: '{"results":[{}]}',
    run: (status: CommandStatus, output?: string) =>
      runOsvCheck({
        executable: 'osv-scanner',
        reportPath: path.join(root, 'osv.json'),
        runCommandImpl: () => commandResult(status, output),
      }),
  };
}

function createGitleaksCase(root: string) {
  const gitleaksPath = path.join(root, 'gitleaks.json');
  return createFileReportCase({
    id: 'gitleaks',
    reportPath: gitleaksPath,
    validJson: '[]',
    invalidJson: '[{}]',
    run: (status, write) =>
      runGitleaksCheck({
        executable: 'gitleaks',
        reportPath: gitleaksPath,
        runCommandImpl: () => {
          write();
          return commandResult(status);
        },
      }),
  });
}

function createLicenseCase(root: string) {
  const policyPath = path.join(root, 'license-policy.json');
  const policy = JSON.stringify({
    mode: 'hardfail',
    firstPartyLicense: 'AGPL-3.0-or-later',
    deniedLicenses: ['GPL-3.0-only'],
    reviewedExceptions: [],
  });
  return {
    id: 'license-inventory',
    findingExit: false,
    validJson: '{"bomFormat":"CycloneDX","specVersion":"1.6","components":[]}',
    invalidJson: '{"bomFormat":"CycloneDX","specVersion":"1.6","components":[{}]}',
    run: (status: CommandStatus, output?: string) => {
      writeOutput(policyPath, policy);
      return runLicenseCheck({
        policyPath,
        reportPath: path.join(root, 'licenses.json'),
        sbomPath: path.join(root, 'sbom.json'),
        runNpmImpl: () => commandResult(status, output),
      });
    },
  };
}

function createAstGrepCase() {
  return {
    id: 'ast-grep',
    findingExit: false,
    validJson: '[]',
    invalidJson: '[{}]',
    run: (status: CommandStatus, output?: string) =>
      runAstGrepCheck({
        files: ['apps/extension/src/example.ts'],
        runCommandImpl: () => commandResult(status, output),
      }),
  };
}

function createKnipCase() {
  return {
    id: 'knip',
    findingExit: true,
    validJson: '{"issues":[]}',
    invalidJson: '{"issues":[{}]}',
    run: (status: CommandStatus, output?: string) =>
      runKnipCheck({
        executable: 'knip',
        runCommandImpl: () => commandResult(status, output),
      }),
  };
}

function createJscpdCase(root: string) {
  const reportPath = path.join(root, 'jscpd.json');
  return createFileReportCase({
    id: 'jscpd',
    reportPath,
    validJson: '{"duplicates":[]}',
    invalidJson: '{"duplicates":[{}]}',
    run: (status, write) =>
      runJscpdCheck({
        baselinePath: null,
        executable: 'jscpd',
        reportPath,
        runCommandImpl: () => {
          write();
          return commandResult(status);
        },
      }),
  });
}

function createSemgrepCase(root: string) {
  return {
    id: 'semgrep',
    findingExit: true,
    validJson: '{"results":[]}',
    invalidJson: '{"results":[{}]}',
    run: (status: CommandStatus, output?: string) =>
      runSemgrepCheck({
        commandSpec: {
          command: 'semgrep',
          args: [],
          env: { SEMGREP_SETTINGS_FILE: path.resolve('.tmp/semgrep/settings.yml') },
        },
        files: ['apps/extension/src/example.ts'],
        reportPath: 'semgrep.json',
        reportRoot: root,
        runCommandImpl: () => commandResult(status, output),
      }),
  };
}

function createAuditCases(root: string) {
  return [
    ...createNpmCases(root),
    createOsvCase(root),
    createGitleaksCase(root),
    createLicenseCase(root),
    createAstGrepCase(),
    createKnipCase(),
    createJscpdCase(root),
    createSemgrepCase(root),
    createCodeqlCase(root),
  ];
}

const auditCases = createAuditCases(createTempRoot('external-audit-result-population-'));

function requiredExternalControlIds() {
  const profiles = JSON.parse(
    fs.readFileSync('tooling/configs/qa/audit-profiles.data.json', 'utf8')
  );
  const required = new Set(
    profiles.profiles.flatMap((profile) =>
      profile.controls.filter(({ requirement }) => requirement === 'required').map(({ id }) => id)
    )
  );
  return AUDIT_STEPS.map(([id]) => id)
    .filter((id) => required.has(id) && !INTERNAL_AUDIT_CONTROL_IDS.has(id))
    .sort();
}

function hostileFixtures() {
  return auditCases.flatMap((audit) => [
    { audit, variant: 'null-status', status: null, output: audit.validJson },
    { audit, variant: 'missing-status', status: undefined, output: audit.validJson },
    { audit, variant: 'undocumented-status', status: 2, output: audit.validJson },
    { audit, variant: 'missing-result', status: 0, output: undefined },
    { audit, variant: 'malformed-result', status: 0, output: '{' },
    { audit, variant: 'invalid-schema', status: 0, output: audit.invalidJson },
    ...(audit.findingExit
      ? [{ audit, variant: 'finding-exit-empty', status: 1, output: audit.validJson }]
      : []),
  ]);
}

it('covers the complete profile-required external-adapter population', () => {
  expect(auditCases.map(({ id }) => id).sort()).toEqual(requiredExternalControlIds());
  expect(auditCases).toHaveLength(10);
});

it.each(hostileFixtures())('$audit.id rejects $variant', ({ audit, status, output }) => {
  expect(() => audit.run(status, output)).toThrow();
});

it.each(auditCases)('$id accepts a nonempty schema-valid clean result', (audit) => {
  const result = audit.run(0, audit.validJson);
  expect(result.status ?? 'passed').toBe('passed');
  if ('skipped' in result) expect(result.skipped).toBe(false);
});
