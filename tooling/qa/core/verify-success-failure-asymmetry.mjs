/**
 * Success/failure asymmetry guardrail.
 * Blocks local state transitions that happen before awaited persistence/runtime work without recovery.
 */

import { collectCodeFiles, isExecutedAsScript } from './shared.mjs';
import { runScopedCodeFileCheck } from './repo-scoped-typescript-scan.mjs';
import { emitScopedReportCliResult, parseScopedReportCliArgs } from './scoped-report-cli.mjs';
import { collectStatefulFlowFamilyViolations } from './stateful-flow-guardrail.mjs';

const TARGET_FAMILY = 'Success/failure asymmetry';

export const SUCCESS_FAILURE_ASYMMETRY_ALLOWED_FINDINGS = [
  {
    file: 'tooling/test/e2e/extension-smoke.popup-startup.ts',
    line: 42,
    rationale:
      'The isolated Playwright context must seed the locale mirror before the storage listener ' +
      'observes the persisted value; a rejected write fails and tears down the test context.',
  },
  {
    file: 'tooling/test/e2e/extension-smoke.popup-startup.ts',
    line: 89,
    rationale:
      'The isolated Playwright context must update the locale mirror before the storage listener ' +
      'observes the persisted value; a rejected write fails and tears down the test context.',
  },
];

const ALLOWED_FINDING_KEYS = new Set(
  SUCCESS_FAILURE_ASYMMETRY_ALLOWED_FINDINGS.map(({ file, line }) => `${file}:${line}`)
);

export function filterAllowedSuccessFailureAsymmetryViolations(violations) {
  return violations.filter(
    ({ file, line }) =>
      !ALLOWED_FINDING_KEYS.has(`${String(file).replaceAll('\\', '/')}:${String(line)}`)
  );
}

export function collectSuccessFailureAsymmetryViolations(files) {
  return filterAllowedSuccessFailureAsymmetryViolations(
    collectStatefulFlowFamilyViolations(files, {
      family: TARGET_FAMILY,
      rule: 'success-failure-asymmetry',
    })
  );
}

export function runSuccessFailureAsymmetryCheck({
  files = [],
  scope = 'workspace',
  collectFiles = collectCodeFiles,
} = {}) {
  return runScopedCodeFileCheck({
    collectFiles,
    collectViolations: collectSuccessFailureAsymmetryViolations,
    files,
    scope,
  });
}

if (isExecutedAsScript(import.meta.url)) {
  const { explicitFiles, reportOnly, repoWide, scope } = parseScopedReportCliArgs(
    process.argv.slice(2)
  );
  const result = runSuccessFailureAsymmetryCheck({
    files: explicitFiles,
    scope,
  });

  process.exit(
    emitScopedReportCliResult({
      labels: {
        failureHeader: 'Success/failure asymmetry violations found:',
        passedRepoWide: 'Success/failure asymmetry repo-wide guardrail passed\n',
        passedWorkspace: 'Success/failure asymmetry guardrail passed\n',
        reportOnlyHeader: 'Success/failure asymmetry report found violations:',
        skippedRepoWide: 'Success/failure asymmetry repo-wide check skipped: no code files\n',
        skippedWorkspace: 'Success/failure asymmetry check skipped: no changed code files\n',
      },
      repoWide,
      reportOnly,
      result,
    })
  );
}
