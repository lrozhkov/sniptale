import { createOkStep, createSkippedStep } from '../focused-qa-results.mjs';
import { projectLoggingStepFromOxlint } from '../../quality/logging-projection.mjs';
import { DEFAULT_OXLINT_ROOTS, runOxlint } from '../../../guards/quality/verify-oxlint.mjs';

export function runFocusedOxlintStep(jsLikeFiles, { fullClosure = false } = {}) {
  return runFocusedOxlintWithProjections(jsLikeFiles, { fullClosure }).oxlintStep;
}

export function runFocusedOxlintWithProjections(jsLikeFiles, { fullClosure = false } = {}) {
  if (fullClosure) {
    const result = runOxlint({ files: DEFAULT_OXLINT_ROOTS });
    const { step } = result;
    return {
      loggingStep: projectLoggingStepFromOxlint({
        step,
        files: DEFAULT_OXLINT_ROOTS,
        lintedFiles: result.targetFiles,
      }),
      oxlintStep: step.status === 'ok' ? createOkStep('Oxlint', 'full config closure') : step,
    };
  }
  const result = runOxlint({ files: jsLikeFiles });
  const { step } = result;
  return {
    loggingStep: projectLoggingStepFromOxlint({
      step,
      files: jsLikeFiles,
      lintedFiles: result.targetFiles,
    }),
    oxlintStep: step.status === 'skipped' ? createSkippedStep('Oxlint') : step,
  };
}
