/**
 * Read-safe naming guardrail.
 * Blocks read-safe or bootstrap-safe names when the function performs actual mutation/repair work.
 */

import { collectCodeFiles, isExecutedAsScript, toRelativePath } from './shared.mjs';
import { runScopedCodeFileCheck } from './repo-scoped-typescript-scan.mjs';
import { emitScopedReportCliResult, parseScopedReportCliArgs } from './scoped-report-cli.mjs';
import { collectReadSafeNamingCandidates } from './verify-read-safe-naming.helpers.mjs';

function createViolation(file, line, functionName) {
  return {
    rule: 'read-safe-naming',
    file,
    line,
    message: `Function "${functionName}" looks read-safe but performs mutation/repair work.`,
  };
}

export function collectReadSafeNamingViolations(files) {
  return files.flatMap((filePath) =>
    collectReadSafeNamingCandidates(filePath).map(({ functionName, line }) =>
      createViolation(toRelativePath(filePath), line, functionName)
    )
  );
}

export function runReadSafeNamingCheck({
  files = [],
  scope = 'workspace',
  collectFiles = collectCodeFiles,
} = {}) {
  return runScopedCodeFileCheck({
    collectFiles,
    collectViolations: collectReadSafeNamingViolations,
    files,
    scope,
  });
}

if (isExecutedAsScript(import.meta.url)) {
  const { explicitFiles, reportOnly, repoWide, scope } = parseScopedReportCliArgs(
    process.argv.slice(2)
  );
  const result = runReadSafeNamingCheck({
    files: explicitFiles,
    scope,
  });
  process.exit(
    emitScopedReportCliResult({
      labels: {
        skippedRepoWide: 'Read-safe naming repo-wide check skipped: no code files\n',
        skippedWorkspace: 'Read-safe naming check skipped: no changed code files\n',
        reportOnlyHeader: 'Read-safe naming report found violations:',
        failureHeader: 'Read-safe naming violations found:',
        passedRepoWide: 'Read-safe naming repo-wide guardrail passed\n',
        passedWorkspace: 'Read-safe naming guardrail passed\n',
      },
      repoWide,
      reportOnly,
      result,
    })
  );
}
