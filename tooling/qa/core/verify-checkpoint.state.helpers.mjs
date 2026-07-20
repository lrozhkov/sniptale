import fs from 'node:fs';

import { fromRelativePath } from './shared.mjs';
import { hasValidProducerRunId, requireProducerRunId } from './qa-proof-state-provenance.mjs';

export const CHECKPOINT_STATE_PATH = '.tmp/qa/checkpoint-state.json';
const CHECKPOINT_WRAPPER_VERSION = 'qa-checkpoint-v2';

export function createCheckpointState({
  context,
  success,
  skipped = false,
  errorMessage = '',
  producerRunId,
}) {
  return {
    version: CHECKPOINT_WRAPPER_VERSION,
    generatedAt: new Date().toISOString(),
    success,
    skipped,
    allDiffFingerprint: context.allFingerprint ?? context.fingerprint,
    allTargetFiles: [...(context.allTargetFiles ?? context.targetFiles)],
    diffFingerprint: context.fingerprint,
    targetFiles: [...context.targetFiles],
    errorMessage,
    producerRunId: requireProducerRunId(producerRunId),
  };
}

export function writeCheckpointState(state) {
  const absolutePath = fromRelativePath(CHECKPOINT_STATE_PATH);
  fs.mkdirSync(fromRelativePath('.tmp/qa'), { recursive: true });
  fs.writeFileSync(absolutePath, `${JSON.stringify(state, null, 2)}\n`);
}

export function readCheckpointState() {
  const absolutePath = fromRelativePath(CHECKPOINT_STATE_PATH);
  if (!fs.existsSync(absolutePath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
  } catch {
    return null;
  }
}

export function assertFreshCheckpointState(context, consumerLabel) {
  const state = readCheckpointState();
  const mismatchReason = resolveCheckpointMismatchReason(state, context);
  if (!mismatchReason) {
    return;
  }

  throw new Error(
    [
      `Run npm run qa:checkpoint for the current uncommitted diff before ${consumerLabel}`,
      `(${mismatchReason})`,
    ].join(' ')
  );
}

function resolveCheckpointMismatchReason(state, context) {
  if (!state) {
    return 'no checkpoint state found';
  }

  if (state.version !== CHECKPOINT_WRAPPER_VERSION) {
    return 'checkpoint state version is stale';
  }
  if (!hasValidProducerRunId(state)) return 'checkpoint state has no valid producer run ID';

  if (!state.success) {
    return state.errorMessage
      ? `last checkpoint run failed: ${state.errorMessage}`
      : 'last checkpoint run did not complete successfully';
  }

  if (state.diffFingerprint !== context.fingerprint) {
    return 'checkpoint state fingerprint does not match the current diff';
  }

  const currentAllFingerprint = context.allFingerprint ?? context.fingerprint;
  if (state.allDiffFingerprint !== currentAllFingerprint) {
    return 'checkpoint state full-diff fingerprint does not match the current repo diff';
  }

  const stateTargets = JSON.stringify(state.targetFiles ?? []);
  const currentTargets = JSON.stringify(context.targetFiles);
  if (stateTargets !== currentTargets) {
    return 'checkpoint state target files do not match the current diff';
  }

  const stateAllTargets = JSON.stringify(state.allTargetFiles ?? state.targetFiles ?? []);
  const currentAllTargets = JSON.stringify(context.allTargetFiles ?? context.targetFiles);
  if (stateAllTargets !== currentAllTargets) {
    return 'checkpoint state full-diff targets do not match the current repo diff';
  }

  return null;
}
