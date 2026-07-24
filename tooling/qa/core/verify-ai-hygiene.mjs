import { collectAiHygieneReport } from './ai-hygiene-utils.mjs';
import {
  collectCodeFiles,
  filterAllowedViolations,
  isExecutedAsScript,
  loadBaseline,
  parseFilesArgument,
  printViolations,
} from './shared.mjs';
import { filterImportOrMockOnlyDiffFiles } from './import-only-diff.mjs';
import { resolveScopedTargetFiles } from '../runtime/target-files.helpers.mjs';

export function runAiHygieneCheck({ files = [] } = {}) {
  const targets = resolveScopedTargetFiles({
    files,
    scope: 'workspace',
    collectFiles: collectCodeFiles,
  });
  const reportFiles = filterImportOrMockOnlyDiffFiles(targets.relativeFiles);
  const report = collectAiHygieneReport(reportFiles);
  return {
    files: reportFiles,
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
