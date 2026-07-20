import { OBSERVABILITY_SCHEMA_VERSION } from './constants.mjs';
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
    correlation: parseCorrelation(
      options.correlation ?? readCorrelationEnvironment(options.environment)
    ),
    summary: emptySummary(),
    steps: [],
    log: {
      path: paths.logRelativePath,
      digest: log.digest,
      byteCount: log.byteCount,
      truncated: log.truncated,
    },
  });
}

export function initializeObservabilityRun(options) {
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
