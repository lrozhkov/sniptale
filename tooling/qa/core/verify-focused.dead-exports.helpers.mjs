import { runDeadExportsCheck, summarizeDeadExportsReport } from './verify-dead-exports.mjs';
import { isProductSourcePath } from './src-production-targets.mjs';

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

function filterDeadExportsReport(report, focusedFileSet) {
  return {
    unusedTypeExports: report.unusedTypeExports.filter((item) => focusedFileSet.has(item.file)),
    unusedValueExports: report.unusedValueExports.filter((item) => focusedFileSet.has(item.file)),
  };
}

export function runFocusedDeadExportsCheck(codeFiles) {
  const tsSourceFiles = codeFiles.filter(
    (file) => isProductSourcePath(file) && /\.(?:ts|tsx)$/u.test(file)
  );
  if (tsSourceFiles.length === 0) {
    return createSkippedResult();
  }

  const focusedFileSet = new Set(tsSourceFiles);
  const filteredReport = filterDeadExportsReport(runDeadExportsCheck(), focusedFileSet);

  return {
    skipped: false,
    report: filteredReport,
    summary: summarizeDeadExportsReport(filteredReport),
  };
}
