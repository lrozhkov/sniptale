import { collectCodeFiles } from '../../analysis/repository/shared-files.mjs';
import { readText, splitLines } from '../../analysis/repository/shared-paths.mjs';
import { collectDeadCommentRuns } from '../../guards/quality/dead-code/commented-code/check.mjs';
import { filterAllowedViolations, loadBaseline } from '../../policy/baselines/shared-baseline.mjs';
import {
  isExecutedAsScript,
  parseFilesArgument,
  printViolations,
} from '../../runtime/process/shared-cli.mjs';
import { resolveScopedTargetFiles } from '../../runtime/scope/target-files.helpers.mjs';

export function collectDeadCommentedCodeViolations(relativePaths) {
  return relativePaths.flatMap((relativePath) =>
    collectDeadCommentRuns(relativePath, splitLines(readText(relativePath)))
  );
}

export function runDeadCommentedCodeCheck({ files = [] } = {}) {
  const targets = resolveScopedTargetFiles({
    files,
    scope: 'workspace',
    collectFiles: collectCodeFiles,
  });
  return {
    files: targets.relativeFiles,
    violations: filterAllowedViolations(
      collectDeadCommentedCodeViolations(targets.relativeFiles),
      loadBaseline()
    ),
  };
}

if (isExecutedAsScript(import.meta.url)) {
  const result = runDeadCommentedCodeCheck({ files: parseFilesArgument(process.argv.slice(2)) });
  if (result.violations.length > 0) {
    printViolations('Dead commented code found:', result.violations);
    process.exit(1);
  }
  process.stdout.write('Dead commented code passed\n');
}
