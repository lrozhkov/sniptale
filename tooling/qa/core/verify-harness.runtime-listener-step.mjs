import { createViolationStep } from './focused-qa-results.mjs';
import { measureSyncStep } from './step-timing.helpers.mjs';
import { runRuntimeListenerSeamCheck } from './verify-runtime-listener-seams.mjs';

export function collectRuntimeListenerStep(context) {
  const { durationMs, value } = measureSyncStep(() =>
    runRuntimeListenerSeamCheck({ files: context.qualityCodeFiles ?? context.codeFiles })
  );
  return {
    ...createViolationStep(
      'Runtime listener ownership',
      'Runtime listener ownership violations found:',
      value
    ),
    durationMs,
  };
}
