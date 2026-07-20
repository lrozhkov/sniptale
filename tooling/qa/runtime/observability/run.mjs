import { randomUUID } from 'node:crypto';

import { DEFAULT_LIMITS } from './constants.mjs';
import { initializeObservabilityRun } from './run-initialization.mjs';
import { ObservabilityRunController } from './run-controller.mjs';
export { summarizeSteps } from './run-record.mjs';

export function createObservabilityRun({
  wrapperId,
  runId,
  rootRunId,
  parentRunId,
  ownerPid = process.pid,
  correlation,
  repositoryContext,
  repositoryScope = 'workspace',
  suite = null,
  targetFiles = [],
  rootDir,
  repositoryRoot = rootDir ?? process.cwd(),
  storageRoot = rootDir,
  environment = process.env,
  clock = Date.now,
  createId = randomUUID,
  maximumLogBytes = DEFAULT_LIMITS.logBytes,
} = {}) {
  const state = initializeObservabilityRun({
    wrapperId,
    runId,
    rootRunId,
    parentRunId,
    ownerPid,
    correlation,
    repositoryContext,
    repositoryScope,
    suite,
    targetFiles,
    repositoryRoot,
    storageRoot,
    environment,
    clock,
    createId,
    maximumLogBytes,
  });
  return new ObservabilityRunController(state);
}
