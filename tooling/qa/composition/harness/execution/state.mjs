import fs from 'node:fs';

import { HARNESS_QA_GUIDANCE, createQaScopeFingerprint } from '../../scope/qa-scope.mjs';
import { fromRelativePath } from '../../../analysis/repository/shared-paths.mjs';
import {
  hasValidProducerRunId,
  requireProducerRunId,
} from '../../../proof/contracts/qa-proof-state-provenance.mjs';
import {
  createQaProofRuntimeIdentity,
  resolveQaProofRuntimeIdentityMismatch,
} from '../../../proof/contracts/qa-proof-runtime-identity.mjs';

export const HARNESS_STATE_PATH = '.tmp/qa/release-harness-state.json';
const HARNESS_WRAPPER_VERSION = 'qa-release-harness-v3';

function collectHarnessTargetFiles(context) {
  return [
    ...(context.harnessVerificationTargetFiles ??
      context.harnessTargetFiles ??
      context.targetFiles ??
      []),
  ];
}

function collectHarnessFingerprint(context) {
  return context.harnessFingerprint ?? createQaScopeFingerprint(collectHarnessTargetFiles(context));
}

export function createHarnessState({
  context,
  success,
  skipped = false,
  errorMessage = '',
  producerRunId,
}) {
  const targetFiles = collectHarnessTargetFiles(context);
  return {
    version: HARNESS_WRAPPER_VERSION,
    generatedAt: new Date().toISOString(),
    success,
    skipped,
    harnessFingerprint: collectHarnessFingerprint(context),
    targetFiles,
    ...createQaProofRuntimeIdentity(),
    errorMessage,
    producerRunId: requireProducerRunId(producerRunId),
  };
}

export function writeHarnessState(state) {
  const absolutePath = fromRelativePath(HARNESS_STATE_PATH);
  fs.mkdirSync(fromRelativePath('.tmp/qa'), { recursive: true });
  fs.writeFileSync(absolutePath, `${JSON.stringify(state, null, 2)}\n`);
}

export function readHarnessState() {
  const absolutePath = fromRelativePath(HARNESS_STATE_PATH);
  if (!fs.existsSync(absolutePath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
  } catch {
    return null;
  }
}

export function assertFreshHarnessState(context, consumerLabel) {
  const targetFiles = collectHarnessTargetFiles(context);
  if (targetFiles.length === 0) {
    return;
  }

  const state = readHarnessState();
  const mismatchReason = resolveHarnessMismatchReason(state, context);
  if (!mismatchReason) {
    return;
  }

  throw new Error(
    [
      `Run npm run qa:release-harness for changed tooling/** before ${consumerLabel}`,
      `(${mismatchReason}).`,
      HARNESS_QA_GUIDANCE,
    ].join(' ')
  );
}

function resolveHarnessMismatchReason(state, context) {
  if (!state) {
    return 'no release-harness state found';
  }

  if (state.version !== HARNESS_WRAPPER_VERSION) {
    return 'release-harness state version is stale';
  }
  if (!hasValidProducerRunId(state)) return 'release-harness state has no valid producer run ID';

  const runtimeMismatch = resolveQaProofRuntimeIdentityMismatch(
    state,
    createQaProofRuntimeIdentity()
  );
  if (runtimeMismatch) return `release-harness ${runtimeMismatch}`;

  if (!state.success) {
    return state.errorMessage
      ? `last release-harness run failed: ${state.errorMessage}`
      : 'last release-harness run did not complete successfully';
  }

  if (state.harnessFingerprint !== collectHarnessFingerprint(context)) {
    return 'release-harness state fingerprint does not match current harness changes';
  }

  const stateTargets = JSON.stringify(state.targetFiles ?? []);
  const currentTargets = JSON.stringify(collectHarnessTargetFiles(context));
  if (stateTargets !== currentTargets) {
    return 'release-harness state target files do not match current harness changes';
  }

  return null;
}
