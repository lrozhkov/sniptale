/**
 * Hot-path cleanup report.
 * Inventories full-scan cleanup/reconciliation inside write-style persistence seams.
 */

import { collectCodeFiles, isExecutedAsScript } from './shared.mjs';
import { runScopedCodeFileCheck } from './repo-scoped-typescript-scan.mjs';
import { emitScopedReportCliResult, parseScopedReportCliArgs } from './scoped-report-cli.mjs';
import { collectHotPathCleanupViolations } from './verify-storage-write-patterns.helpers.mjs';

export function runHotPathCleanupCheck({ files = [], scope = 'workspace' } = {}) {
  return runScopedCodeFileCheck({
    collectFiles: collectCodeFiles,
    collectViolations: collectHotPathCleanupViolations,
    files,
    scope,
  });
}

if (isExecutedAsScript(import.meta.url)) {
  const { explicitFiles, reportOnly, repoWide, scope } = parseScopedReportCliArgs(
    process.argv.slice(2)
  );
  const result = runHotPathCleanupCheck({
    files: explicitFiles,
    scope,
  });
  process.exit(
    emitScopedReportCliResult({
      labels: {
        skippedRepoWide: 'Hot-path cleanup repo-wide check skipped: no code files\n',
        skippedWorkspace: 'Hot-path cleanup check skipped: no changed code files\n',
        reportOnlyHeader: 'Hot-path cleanup report found violations:',
        failureHeader: 'Hot-path cleanup violations found:',
        passedRepoWide: 'Hot-path cleanup repo-wide report passed\n',
        passedWorkspace: 'Hot-path cleanup report passed\n',
      },
      repoWide,
      reportOnly,
      result,
    })
  );
}
