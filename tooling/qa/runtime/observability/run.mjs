import { createHash, randomUUID } from 'node:crypto';

import { DEFAULT_LIMITS, OBSERVABILITY_SCHEMA_VERSION } from './constants.mjs';
import { collectRepositoryContext } from './repository-context.mjs';
import { resolveObservabilityRoot } from './root.mjs';
import { emptySummary, isoTimestamp } from './run-record.mjs';
import { collectSensitiveEnvironmentValues } from './sanitize.mjs';
import {
  parseCorrelation,
  parseRunRecord,
  readCorrelationEnvironment,
  readRunIdentityEnvironment,
} from './schema.mjs';
import { appendBoundedLog, resolveObservabilityPaths, writeJsonAtomic } from './storage.mjs';
import { ObservabilityRunController } from './run-controller.mjs';
export { summarizeSteps } from './run-record.mjs';

function resolveIdentity({ runId, rootRunId, parentRunId, environment, createId }) {
  const inherited = readRunIdentityEnvironment(environment);
  const resolvedRunId = runId ?? inherited.runId ?? createId();
  const resolvedParentRunId = parentRunId ?? inherited.parentRunId ?? null;
  return {
    runId: resolvedRunId,
    parentRunId: resolvedParentRunId,
    rootRunId: rootRunId ?? inherited.rootRunId ?? resolvedParentRunId ?? resolvedRunId,
  };
}

function collectRepository(options) {
  const collected =
    options.repositoryContext ??
    collectRepositoryContext({
      rootDir: options.repositoryRoot,
      scope: options.repositoryScope,
      suite: options.suite,
      targetFiles: options.targetFiles,
    });
  return {
    ...collected,
    scope: collected.scope ?? options.repositoryScope,
    suite: collected.suite ?? options.suite,
    mode: collected.mode ?? 'default',
    targetFiles: collected.targetFiles ?? [...new Set(options.targetFiles)].sort(),
  };
}

function resolveCorrelation(options, repository) {
  const correlation = parseCorrelation(
    options.correlation ?? readCorrelationEnvironment(options.environment)
  );
  if (correlation.workflowId || !correlation.taskId || !repository.head) return correlation;
  const digest = createHash('sha256')
    .update(`${correlation.taskId}\0${repository.head}`)
    .digest('hex')
    .slice(0, 24);
  return parseCorrelation({ ...correlation, workflowId: `workflow.${digest}` });
}

function createRecord(options, identity, startedAt, paths, log, repository) {
  return parseRunRecord({
    schemaVersion: OBSERVABILITY_SCHEMA_VERSION,
    ...identity,
    ownerPid: options.ownerPid,
    wrapperId: options.wrapperId,
    status: 'running',
    exitCode: null,
    startedAt,
    finishedAt: null,
    durationMs: null,
    repository,
    correlation: resolveCorrelation(options, repository),
    summary: emptySummary(),
    steps: [],
    timeline: { events: [], activities: [] },
    preflightContext: null,
    changeRisk: null,
    advisory: null,
    log: {
      path: paths.logRelativePath,
      digest: log.digest,
      byteCount: log.byteCount,
      truncated: log.truncated,
    },
  });
}

function initializeObservabilityRun(options) {
  const durableRoot =
    options.storageRoot ??
    resolveObservabilityRoot({ cwd: options.repositoryRoot, environment: options.environment });
  const identity = resolveIdentity(options);
  const startedAt = isoTimestamp(options.clock);
  const paths = resolveObservabilityPaths({
    rootDir: durableRoot,
    runId: identity.runId,
    startedAt,
  });
  const repositoryRoots = [options.repositoryRoot, durableRoot];
  const repository = collectRepository(options);
  const log = appendBoundedLog(paths.logPath, '', {
    maximumBytes: options.maximumLogBytes,
    repositoryRoots,
    sensitiveValues: collectSensitiveEnvironmentValues(options.environment),
  });
  const record = createRecord(options, identity, startedAt, paths, log, repository);
  writeJsonAtomic(paths.runPath, record, { createOnly: true });
  return {
    record,
    paths,
    repositoryRoots,
    clock: options.clock,
    maximumLogBytes: options.maximumLogBytes,
    sensitiveValues: collectSensitiveEnvironmentValues(options.environment),
  };
}

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
