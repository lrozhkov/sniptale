import { filterImportOnlyDiffFiles, isImportOrMockOnlyDiffFile } from './import-only-diff.mjs';
import { createOkStep, createSkippedStep } from './focused-qa-results.mjs';
import { DEFAULT_OXLINT_ROOTS, runOxlint } from './verify-oxlint.mjs';

export function runFocusedOxlintStep(jsLikeFiles, { fullClosure = false } = {}) {
  if (fullClosure) {
    const step = runOxlint({ files: DEFAULT_OXLINT_ROOTS }).step;
    return step.status === 'ok' ? createOkStep('Oxlint', 'full config closure') : step;
  }
  const behavioralFiles = filterImportOnlyDiffFiles(jsLikeFiles);
  const behavioralFileSet = new Set(behavioralFiles);
  const importOnlyFiles = jsLikeFiles.filter(
    (file) => !behavioralFileSet.has(file) && isImportOrMockOnlyDiffFile(file)
  );

  const strictStep = runOxlint({ files: behavioralFiles }).step;
  if (strictStep.status === 'failed') {
    return strictStep;
  }

  const importOnlyStep = runOxlint({ files: importOnlyFiles }).step;
  if (importOnlyStep.status === 'failed') {
    return importOnlyStep;
  }

  if (strictStep.status === 'skipped' && importOnlyStep.status === 'skipped') {
    return createSkippedStep('Oxlint');
  }

  if (importOnlyFiles.length > 0) {
    return createOkStep(
      'Oxlint',
      `strict files=${behavioralFiles.length}; import-only files=${importOnlyFiles.length} without size rules`
    );
  }

  return strictStep;
}
