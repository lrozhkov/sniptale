/**
 * Lifecycle intent guardrail.
 * Blocks reconnect/retry seams that schedule recovery work without explicit stop/disconnect intent.
 */

import { collectCodeFiles, isExecutedAsScript } from './shared.mjs';
import { runScopedCodeFileCheck } from './repo-scoped-typescript-scan.mjs';
import { emitScopedReportCliResult, parseScopedReportCliArgs } from './scoped-report-cli.mjs';
import { collectStatefulFlowFamilyViolations } from './stateful-flow-guardrail.mjs';

const TARGET_FAMILY = 'Lifecycle intent loss in reconnect/retry seams';

export function collectLifecycleIntentViolations(files) {
  return collectStatefulFlowFamilyViolations(files, {
    family: TARGET_FAMILY,
    rule: 'lifecycle-intent',
  });
}

export function runLifecycleIntentCheck({
  files = [],
  scope = 'workspace',
  collectFiles = collectCodeFiles,
} = {}) {
  return runScopedCodeFileCheck({
    collectFiles,
    collectViolations: collectLifecycleIntentViolations,
    files,
    scope,
  });
}

if (isExecutedAsScript(import.meta.url)) {
  const { explicitFiles, reportOnly, repoWide, scope } = parseScopedReportCliArgs(
    process.argv.slice(2)
  );
  const result = runLifecycleIntentCheck({
    files: explicitFiles,
    scope,
  });
  process.exit(
    emitScopedReportCliResult({
      labels: {
        skippedRepoWide: 'Lifecycle intent repo-wide check skipped: no code files\n',
        skippedWorkspace: 'Lifecycle intent check skipped: no changed code files\n',
        reportOnlyHeader: 'Lifecycle intent report found violations:',
        failureHeader: 'Lifecycle intent violations found:',
        passedRepoWide: 'Lifecycle intent repo-wide guardrail passed\n',
        passedWorkspace: 'Lifecycle intent guardrail passed\n',
      },
      repoWide,
      reportOnly,
      result,
    })
  );
}
