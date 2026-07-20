import { OBSERVABILITY_SCHEMA_VERSION, RUN_STATUSES, STEP_OUTCOMES } from './constants.mjs';
import {
  assertExactKeys,
  assertId,
  assertIsoTimestamp,
  assertNonNegativeInteger,
  assertNonNegativeNumber,
  assertObject,
  assertStringArray,
} from './schema-assertions.mjs';
import { assertLifecycleConsistency } from './schema-consistency.mjs';
import { parseDiagnostic } from './diagnostic-schema.mjs';
import { parseCorrelation, parseLog, parseRepository, parseSummary } from './schema-parts.mjs';

export {
  parseCorrelation,
  readCorrelationEnvironment,
  readRunIdentityEnvironment,
} from './schema-parts.mjs';

const RECORD_KEYS = [
  'schemaVersion',
  'runId',
  'rootRunId',
  'parentRunId',
  'ownerPid',
  'wrapperId',
  'status',
  'exitCode',
  'startedAt',
  'finishedAt',
  'durationMs',
  'repository',
  'correlation',
  'summary',
  'steps',
  'log',
];
const STEP_KEYS = [
  'stepId',
  'outcome',
  'startedAt',
  'finishedAt',
  'durationMs',
  'controlIds',
  'problemIds',
  'skipReasonId',
  'diagnostic',
];

export function parseStep(value) {
  assertObject(value, 'step');
  assertExactKeys(value, STEP_KEYS, 'step');
  assertId(value.stepId, 'step.stepId');
  if (!STEP_OUTCOMES.includes(value.outcome)) throw new TypeError('step.outcome is invalid');
  assertIsoTimestamp(value.startedAt, 'step.startedAt');
  assertIsoTimestamp(value.finishedAt, 'step.finishedAt');
  assertNonNegativeNumber(value.durationMs, 'step.durationMs');
  assertStringArray(value.controlIds, 'step.controlIds');
  assertStringArray(value.problemIds, 'step.problemIds');
  if (value.skipReasonId !== null) assertId(value.skipReasonId, 'step.skipReasonId');
  if ((value.outcome === 'skipped') !== (value.skipReasonId !== null)) {
    throw new TypeError('step.skipReasonId is required only for skipped steps');
  }
  const requiresProblem = ['problems-found', 'error', 'interrupted'].includes(value.outcome);
  if (requiresProblem !== value.problemIds.length > 0) {
    throw new TypeError('step.problemIds must identify every non-success outcome only');
  }
  const elapsedMs = Date.parse(value.finishedAt) - Date.parse(value.startedAt);
  if (elapsedMs !== value.durationMs) {
    throw new TypeError('step.durationMs must match its timestamp interval');
  }
  return {
    ...value,
    controlIds: [...value.controlIds].sort(),
    problemIds: [...value.problemIds].sort(),
    diagnostic: parseDiagnostic(value.diagnostic),
  };
}

export function parseRunRecord(value) {
  assertObject(value, 'run record');
  assertExactKeys(value, RECORD_KEYS, 'run record');
  if (value.schemaVersion !== OBSERVABILITY_SCHEMA_VERSION) {
    throw new TypeError(`Unsupported observability schema version: ${String(value.schemaVersion)}`);
  }
  assertId(value.runId, 'runId');
  assertId(value.rootRunId, 'rootRunId');
  if (value.parentRunId !== null) assertId(value.parentRunId, 'parentRunId');
  if (!Number.isSafeInteger(value.ownerPid) || value.ownerPid <= 0) {
    throw new TypeError('ownerPid must be a positive process identifier');
  }
  assertId(value.wrapperId, 'wrapperId');
  if (!RUN_STATUSES.includes(value.status)) throw new TypeError('status is invalid');
  if (value.exitCode !== null) assertNonNegativeInteger(value.exitCode, 'exitCode');
  assertIsoTimestamp(value.startedAt, 'startedAt');
  assertIsoTimestamp(value.finishedAt, 'finishedAt', { nullable: true });
  assertNonNegativeNumber(value.durationMs, 'durationMs', { nullable: true });
  if (!Array.isArray(value.steps)) throw new TypeError('steps must be an array');
  const record = {
    ...value,
    repository: parseRepository(value.repository),
    correlation: parseCorrelation(value.correlation),
    summary: parseSummary(value.summary),
    steps: value.steps.map(parseStep),
    log: parseLog(value.log, value),
  };
  assertLifecycleConsistency(record);
  return record;
}
