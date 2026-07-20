/**
 * Destructive async swap guardrail.
 * Blocks teardown-before-await flows that rebuild after async work without stale guards or recovery.
 */

import { collectCodeFiles, isExecutedAsScript, toRelativePath } from './shared.mjs';
import { runScopedCodeFileCheck } from './repo-scoped-typescript-scan.mjs';
import { emitScopedReportCliResult, parseScopedReportCliArgs } from './scoped-report-cli.mjs';
import { collectDestructiveAsyncSwapCandidates } from './verify-destructive-async-swaps.helpers.mjs';

function createViolation(file, line, functionName) {
  return {
    rule: 'destructive-async-swaps',
    file,
    line,
    message: [
      `Function "${functionName}" tears down owned state before awaited async rebuild work.`,
      'Use swap-after-ready, recovery, or a stale-result guard.',
    ].join(' '),
  };
}

export function collectDestructiveAsyncSwapViolations(files) {
  return files.flatMap((filePath) =>
    collectDestructiveAsyncSwapCandidates(filePath).map(({ functionName, line }) =>
      createViolation(toRelativePath(filePath), line, functionName)
    )
  );
}

export function runDestructiveAsyncSwapCheck({
  files = [],
  scope = 'workspace',
  collectFiles = collectCodeFiles,
} = {}) {
  return runScopedCodeFileCheck({
    collectFiles,
    collectViolations: collectDestructiveAsyncSwapViolations,
    files,
    scope,
  });
}

if (isExecutedAsScript(import.meta.url)) {
  const { explicitFiles, reportOnly, repoWide, scope } = parseScopedReportCliArgs(
    process.argv.slice(2)
  );
  const result = runDestructiveAsyncSwapCheck({
    files: explicitFiles,
    scope,
  });
  process.exit(
    emitScopedReportCliResult({
      labels: {
        skippedRepoWide: 'Destructive async swap repo-wide check skipped: no code files\n',
        skippedWorkspace: 'Destructive async swap check skipped: no changed code files\n',
        reportOnlyHeader: 'Destructive async swap report found violations:',
        failureHeader: 'Destructive async swap violations found:',
        passedRepoWide: 'Destructive async swap repo-wide guardrail passed\n',
        passedWorkspace: 'Destructive async swap guardrail passed\n',
      },
      repoWide,
      reportOnly,
      result,
    })
  );
}
