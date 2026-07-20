import { createFailureStep, createSkippedStep } from './focused-qa-results.mjs';
import { formatFocusedScopeDecision } from './focused-scope-decision.mjs';
import { timeSyncStep } from './step-timing.helpers.mjs';

const HIGH_RISK_FOCUSED_PROOF_PATTERNS = [
  /^apps\/extension\/src\/background\//u,
  /^apps\/extension\/src\/offscreen\//u,
  /^apps\/extension\/src\/contracts\//u,
  /^apps\/extension\/src\/composition\/persistence\//u,
  /^apps\/extension\/src\/features\/ai\/privacy\//u,
  /^apps\/extension\/src\/platform\/(?:security|sanitizers)\//u,
  /^apps\/extension\/src\/settings\/(?:runtime\/privacy-erasure-client|sections\/privacy)\//u,
  /^packages\/(?:runtime-contracts|platform)\/src\//u,
  /^apps\/extension\/src\/background\/llm\//u,
  /^src\/settings\/sections\/ai-providers\//u,
  /^apps\/extension\/src\/settings\/sections\/ai-providers\//u,
];

const HIGH_RISK_FOCUSED_PROOF_EXCLUSIONS = new Set([
  'apps/extension/src/background/application/runtime-state/authority-flows-support.ts',
]);

export function isHighRiskFocusedProofFile(file) {
  return (
    !HIGH_RISK_FOCUSED_PROOF_EXCLUSIONS.has(file) &&
    HIGH_RISK_FOCUSED_PROOF_PATTERNS.some((pattern) => pattern.test(file))
  );
}

export function createHighRiskAmbiguousProofSteps(scope) {
  const decision = formatFocusedScopeDecision(scope, 'blocked');
  return [
    timeSyncStep(() =>
      createFailureStep('Unit tests', 'high-risk focused proof is ambiguous', {
        stderr: [
          `High-risk focused proof cannot be deferred: ${decision}`,
          'Add explicit focused owner-test mapping, adjacent owner tests, or narrow the change.',
          '',
        ].join('\n'),
      })
    ),
    timeSyncStep(() => createSkippedStep('Test coverage', 'blocked: ambiguous high-risk proof')),
  ];
}
