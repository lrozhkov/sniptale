/**
 * Read-path side-effect guardrail.
 * Blocks get/list/load/read-style functions that perform write/sync mutations in targeted storage/db seams.
 */

import { collectCodeFiles, isExecutedAsScript } from './shared.mjs';
import { emitScopedReportCliResult, parseScopedReportCliArgs } from './scoped-report-cli.mjs';
import {
  getNodeLine,
  runScopedCodeFileCheck,
  scanRepoScopedTypeScriptFiles,
} from './repo-scoped-typescript-scan.mjs';
import { collectFileReadPathFunctionViolations } from './verify-read-path-side-effects.helpers.mjs';

const TARGET_FILE_PATTERNS = [
  /^apps\/extension\/src\/composition\/persistence\/.+\.[cm]?[jt]sx?$/u,
  /^apps\/extension\/src\/features\/media-hub\/.+\.[cm]?[jt]sx?$/u,
];

function createViolation(file, functionName, line) {
  return {
    rule: 'read-path-side-effects',
    file,
    line,
    message: [
      `Read-style function "${functionName}" performs write/sync side effects.`,
      'Move repair writes out of read paths.',
    ].join(' '),
  };
}

export function collectReadPathSideEffectViolations(files) {
  const violations = [];

  scanRepoScopedTypeScriptFiles(files, {
    targetFilePatterns: TARGET_FILE_PATTERNS,
    visitFile: ({ relativePath, sourceFile }) => {
      violations.push(
        ...collectFileReadPathFunctionViolations(sourceFile).map(({ functionName, node }) =>
          createViolation(relativePath, functionName, getNodeLine(sourceFile, node))
        )
      );
    },
  });

  return violations;
}

export function runReadPathSideEffectCheck({ files = [], scope = 'workspace' } = {}) {
  return runScopedCodeFileCheck({
    collectFiles: collectCodeFiles,
    collectViolations: collectReadPathSideEffectViolations,
    files,
    scope,
  });
}

if (isExecutedAsScript(import.meta.url)) {
  const { explicitFiles, reportOnly, repoWide, scope } = parseScopedReportCliArgs(
    process.argv.slice(2)
  );
  const result = runReadPathSideEffectCheck({
    files: explicitFiles,
    scope,
  });

  process.exit(
    emitScopedReportCliResult({
      labels: {
        failureHeader: 'Read-path side-effect violations found:',
        passedRepoWide: 'Read-path side-effect repo-wide guardrail passed\n',
        passedWorkspace: 'Read-path side-effect guardrail passed\n',
        reportOnlyHeader: 'Read-path side-effect report found violations:',
        skippedRepoWide: 'Read-path side-effect repo-wide check skipped: no code files\n',
        skippedWorkspace: 'Read-path side-effect check skipped: no changed code files\n',
      },
      repoWide,
      reportOnly,
      result,
    })
  );
}
