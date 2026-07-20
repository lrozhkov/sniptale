import { createFailureStep, createSkippedStep } from './focused-qa-results.mjs';
import { timeSyncStep } from './step-timing.helpers.mjs';
import {
  createHighRiskAmbiguousProofSteps,
  isHighRiskFocusedProofFile,
} from './verify-focused.high-risk-proof.helpers.mjs';
import { formatFocusedScopeDecision } from './focused-scope-decision.mjs';

function createDeferredUnitStep(scope) {
  const decision = formatFocusedScopeDecision(scope, 'deferred');
  return createSkippedStep(
    'Unit tests',
    `deferred: ambiguous focused scope; ${decision}; proof=qa:audit`
  );
}

function createDeferredCoverageStep(scope) {
  return createSkippedStep(
    'Test coverage',
    `deferred to qa:audit; ${formatFocusedScopeDecision(scope, 'deferred')}`
  );
}

function createBlockedNewFileSteps(scope) {
  return [
    timeSyncStep(() =>
      createFailureStep('Unit tests', 'new coverage-eligible file has no local test owner', {
        stderr: `${scope.detail}\nAdd an adjacent test or focused coverage owner mapping.\n`,
      })
    ),
    timeSyncStep(() => createSkippedStep('Test coverage', 'blocked: missing local test owner')),
  ];
}

function createBlockedInvalidOwnerMapSteps(scope) {
  return [
    timeSyncStep(() =>
      createFailureStep('Unit tests', 'focused coverage owner map is invalid', {
        stderr: `${scope.detail}\nFix focused coverage owner mappings before running Vitest.\n`,
      })
    ),
    timeSyncStep(() => createSkippedStep('Test coverage', 'blocked: invalid owner map')),
  ];
}

function createDeferredFocusedSteps(classification, directTestFiles) {
  const unitStep =
    directTestFiles.length === 0
      ? createSkippedStep('Unit tests', 'skipped: no local test owner in diff')
      : createDeferredUnitStep(classification);

  return [
    timeSyncStep(() => unitStep),
    timeSyncStep(() => createDeferredCoverageStep(classification)),
  ];
}

export function createFocusedEarlyExitSteps({ codeFiles, directTestFiles, focusedScope }) {
  if (focusedScope.verdict === 'block-new-file-no-owner') {
    return createBlockedNewFileSteps(focusedScope);
  }
  if (focusedScope.verdict === 'block-invalid-owner-map') {
    return createBlockedInvalidOwnerMapSteps(focusedScope);
  }
  if (focusedScope.verdict === 'defer-ambiguous-existing') {
    if (codeFiles.some(isHighRiskFocusedProofFile)) {
      return createHighRiskAmbiguousProofSteps(focusedScope);
    }
    return createDeferredFocusedSteps(focusedScope, directTestFiles);
  }
  return null;
}
