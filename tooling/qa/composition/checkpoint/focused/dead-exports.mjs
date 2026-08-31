import {
  runDeadExportsCheck,
  summarizeDeadExportsReport,
} from '../../../guards/quality/dead-code/dead-exports/check.mjs';
import { isProductSourcePath } from '../../../analysis/repository/src-production-targets.mjs';

const EMPTY_REPORT = {
  unusedTypeExports: [],
  unusedValueExports: [],
};

function createSkippedResult() {
  return {
    skipped: true,
    report: EMPTY_REPORT,
    summary: { unusedTypeExportCount: 0, unusedValueExportCount: 0 },
  };
}

export function runFocusedDeadExportsCheck(
  codeFiles,
  { deadExportsRunner = runDeadExportsCheck } = {}
) {
  const tsSourceFiles = codeFiles.filter(
    (file) => isProductSourcePath(file) && /\.(?:ts|tsx)$/u.test(file)
  );
  if (tsSourceFiles.length === 0) {
    return createSkippedResult();
  }

  const report = deadExportsRunner();

  return {
    skipped: false,
    report,
    summary: summarizeDeadExportsReport(report),
    sourceIndexStats: report.sourceIndexStats,
  };
}
