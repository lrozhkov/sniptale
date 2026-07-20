import fs from 'node:fs';
import path from 'node:path';

import { fromRelativePath } from './shared.mjs';

export const ADVISORY_STATE_PATH = '.tmp/qa/agent-advisory-state.json';
const ADVISORY_WRAPPER_VERSION = 'agent-advisory-v1';

export function assertDiffOnlyAdvisoryRun(files = [], wrapperName = 'qa:advisory') {
  if (files.length > 0) {
    throw new Error(
      `${wrapperName} uses the current uncommitted diff only; remove the explicit --files scope`
    );
  }
}

export function createAdvisoryState({
  context,
  success,
  skipped = false,
  errorMessage = '',
  producerRunId,
}) {
  return {
    version: ADVISORY_WRAPPER_VERSION,
    generatedAt: new Date().toISOString(),
    success,
    skipped,
    diffFingerprint: context.fingerprint,
    targetFiles: [...context.targetFiles],
    errorMessage,
    ...(producerRunId ? { producerRunId } : {}),
  };
}

export function writeAdvisoryState(state) {
  const absolutePath = fromRelativePath(ADVISORY_STATE_PATH);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, `${JSON.stringify(state, null, 2)}\n`);
}
