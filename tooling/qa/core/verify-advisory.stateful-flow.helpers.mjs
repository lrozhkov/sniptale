import { collectReadSafeNamingCandidates } from './verify-read-safe-naming.helpers.mjs';
import { collectSuccessFailureAsymmetryFinding } from './verify-advisory.success-failure.helpers.mjs';
import { collectDestructiveAsyncSwapCandidates } from './verify-destructive-async-swaps.helpers.mjs';
import {
  collectFunctionLikeFindings,
  createAdvisoryTypeScriptContext,
} from './advisory-typescript-helpers.mjs';
const RECONNECT_OR_RETRY_PATTERN = /\b(?:reconnect|retry)[A-Z_]/u;
const EXPLICIT_INTENT_TOKENS = [
  'disconnectRequested',
  'disconnectIntent',
  'closedByUser',
  'explicitDisconnect',
  'stopRequested',
  'shouldReconnect',
  'aborted',
  'abortSignal',
];

export function collectStatefulFlowFindings(file, createFinding) {
  const context = createAdvisoryTypeScriptContext(file);
  if (!context) {
    return [];
  }

  const { relativePath, sourceFile } = context;
  return collectFunctionStatefulFlowFindings({ createFinding, relativePath, sourceFile, file });
}

function collectFunctionStatefulFlowFindings(args) {
  const { createFinding, file, relativePath, sourceFile } = args;
  return collectFunctionLikeFindings(sourceFile, ({ bodyText, functionName, line, node }) => [
    ...collectReadSafeNamingFinding({
      bodyText,
      createFinding,
      file,
      functionName,
      line,
      relativePath,
    }),
    ...collectLifecycleIntentFinding({
      bodyText,
      createFinding,
      functionName,
      line,
      relativePath,
    }),
    ...collectDestructiveSwapFinding({
      bodyText,
      createFinding,
      file,
      functionName,
      line,
      relativePath,
    }),
    ...collectSuccessFailureAsymmetryFinding({
      createFinding,
      functionName,
      line,
      node,
      relativePath,
    }),
  ]);
}

function collectReadSafeNamingFinding(args) {
  const { createFinding, file, functionName, line, relativePath } = args;
  const hasCandidate = collectReadSafeNamingCandidates(file).some(
    (candidate) => candidate.functionName === functionName && candidate.line === line
  );
  if (!hasCandidate) {
    return [];
  }

  return [
    createFinding({
      family: 'Misleading read-safe / bootstrap naming',
      file: relativePath,
      line,
      reason: `Function "${functionName}" looks read-safe but performs mutation/repair work.`,
      hint: 'Rename the seam to match mutation intent or split read and repair responsibilities.',
      severity: 'attention',
    }),
  ];
}

function collectLifecycleIntentFinding(args) {
  const { bodyText, createFinding, functionName, line, relativePath } = args;
  if (
    !RECONNECT_OR_RETRY_PATTERN.test(bodyText) ||
    !/\bsetTimeout\(/u.test(bodyText) ||
    hasExplicitIntentGuard(bodyText)
  ) {
    return [];
  }

  return [
    createFinding({
      family: 'Lifecycle intent loss in reconnect/retry seams',
      file: relativePath,
      line,
      reason: [
        `Function "${functionName}" retries/reconnects without an explicit stop/disconnect`,
        'intent guard.',
      ].join(' '),
      hint: 'Track explicit disconnect intent so retry logic cannot revive a seam after a deliberate stop.',
      severity: 'attention',
    }),
  ];
}

function hasExplicitIntentGuard(bodyText) {
  return EXPLICIT_INTENT_TOKENS.some((token) => bodyText.includes(token));
}

function collectDestructiveSwapFinding(args) {
  const { createFinding, file, functionName, line, relativePath } = args;
  const hasCandidate = collectDestructiveAsyncSwapCandidates(file).some(
    (candidate) => candidate.functionName === functionName && candidate.line === line
  );
  if (!hasCandidate) {
    return [];
  }

  return [
    createFinding({
      family: 'Destructive async swap risk',
      file: relativePath,
      line,
      reason: [
        `Function "${functionName}" tears down state before an async rebuild`,
        'without an obvious stale-result guard.',
      ].join(' '),
      hint: 'Prefer swap-after-ready or request-token guards so stale async work cannot restore the wrong state.',
    }),
  ];
}
