import { collectCodeFiles } from '../../analysis/repository/shared-files.mjs';
import { readText, splitLines } from '../../analysis/repository/shared-paths.mjs';
import { collectDeadCommentRuns } from '../../guards/quality/dead-code/commented-code/check.mjs';
import { collectOversizedInlineLiteralViolations } from '../../guards/quality/readability/inline-literals/check.mjs';
import { filterAllowedViolations, loadBaseline } from '../../policy/baselines/shared-baseline.mjs';
import {
  isExecutedAsScript,
  parseFilesArgument,
  printViolations,
} from '../../runtime/process/shared-cli.mjs';
import { resolveScopedTargetFiles } from '../../runtime/scope/target-files.helpers.mjs';

export function collectAiHygieneReport(relativePaths) {
  const violations = [];
  for (const relativePath of relativePaths) {
    const source = readText(relativePath);
    violations.push(...collectDeadCommentRuns(relativePath, splitLines(source)));
    violations.push(...collectOversizedInlineLiteralViolations(relativePath, source));
  }
  return { violations };
}

export function runAiHygieneCheck({ files = [] } = {}) {
  const targets = resolveScopedTargetFiles({
    files,
    scope: 'workspace',
    collectFiles: collectCodeFiles,
  });
  const report = collectAiHygieneReport(targets.relativeFiles);
  return {
    files: targets.relativeFiles,
    report,
    violations: filterAllowedViolations(report.violations, loadBaseline()),
  };
}

if (isExecutedAsScript(import.meta.url)) {
  const result = runAiHygieneCheck({ files: parseFilesArgument(process.argv.slice(2)) });
  if (result.violations.length > 0) {
    printViolations('AI hygiene violations found:', result.violations);
    process.exit(1);
  }
  process.stdout.write('AI hygiene passed\n');
}
