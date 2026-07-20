import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

import { fromRelativePath } from './shared.mjs';
import { hasValidProducerRunId, requireProducerRunId } from './qa-proof-state-provenance.mjs';

export const BUILD_STATE_PATH = '.tmp/qa/build-state.json';
const BUILD_WRAPPER_VERSION = 'qa-build-v2';

function gitExecutable() {
  return process.platform === 'win32' ? 'git.exe' : 'git';
}

function headRevision() {
  try {
    return execFileSync(gitExecutable(), ['rev-parse', 'HEAD'], {
      cwd: process.cwd(),
      encoding: 'utf8',
    }).trim();
  } catch {
    return null;
  }
}

function allTargetFiles(context) {
  return [...(context.allTargetFiles ?? context.targetFiles ?? [])];
}

export function createBuildState({ context, success, errorMessage = '', producerRunId }) {
  return {
    allDiffFingerprint: context.allFingerprint ?? context.fingerprint,
    allTargetFiles: allTargetFiles(context),
    errorMessage,
    generatedAt: new Date().toISOString(),
    headRevision: headRevision(),
    success,
    version: BUILD_WRAPPER_VERSION,
    producerRunId: requireProducerRunId(producerRunId),
  };
}

export function writeBuildState(state) {
  fs.mkdirSync(fromRelativePath('.tmp/qa'), { recursive: true });
  fs.writeFileSync(fromRelativePath(BUILD_STATE_PATH), `${JSON.stringify(state, null, 2)}\n`);
}

export function readBuildState() {
  const path = fromRelativePath(BUILD_STATE_PATH);
  if (!fs.existsSync(path)) return null;
  try {
    return JSON.parse(fs.readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function mismatchReason(state, context) {
  if (!state) return 'no artifact build state found';
  if (state.version !== BUILD_WRAPPER_VERSION) return 'artifact build state version is stale';
  if (!hasValidProducerRunId(state)) return 'artifact build state has no valid producer run ID';
  if (!state.success)
    return state.errorMessage || 'last artifact build did not complete successfully';
  if (state.headRevision !== headRevision()) return 'artifact build HEAD revision does not match';
  if (state.allDiffFingerprint !== (context.allFingerprint ?? context.fingerprint)) {
    return 'artifact build full-diff fingerprint does not match';
  }
  if (JSON.stringify(state.allTargetFiles ?? []) !== JSON.stringify(allTargetFiles(context))) {
    return 'artifact build target files do not match';
  }
  return null;
}

/** A simple local freshness stamp, bound only to HEAD and the unchanged full worktree diff. */
export function assertFreshBuildState(context, consumerLabel) {
  const reason = mismatchReason(readBuildState(), context);
  if (!reason) return;
  throw new Error(`Run npm run qa:build -- --proof before ${consumerLabel} (${reason})`);
}
