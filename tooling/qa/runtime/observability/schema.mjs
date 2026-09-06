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
import { parseTimeline } from './timeline-schema.mjs';
import { parseAdvisory, parseChangeRisk, parsePreflightContext } from './analysis-schema.mjs';

export {
  parseCorrelation,
  readCorrelationEnvironment,
  readRunIdentityEnvironment,
} from './schema-parts.mjs';

const V2_RECORD_KEYS = [
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
const RECORD_KEYS = [...V2_RECORD_KEYS.slice(0, -1), 'timeline', 'log'];
const V5_RECORD_KEYS = [
  ...RECORD_KEYS.slice(0, -1),
  'preflightContext',
  'changeRisk',
  'advisory',
  'log',
];
const LEGACY_STEP_KEYS = [
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
const STEP_KEYS = [...LEGACY_STEP_KEYS, 'population', 'inheritance'];

function parseInheritance(value) {
  if (value === null) return null;
  assertObject(value, 'step.inheritance');
  assertExactKeys(
    value,
    [
      'sourceProofSemanticDigest',
      'sourceProofManifestDigest',
      'sourceControlId',
      'sourceRunRecord',
      'evidenceFiles',
    ],
    'step.inheritance'
  );
  for (const field of ['sourceProofSemanticDigest', 'sourceProofManifestDigest']) {
    if (!/^sha256:[a-f0-9]{64}$/u.test(value[field] ?? '')) {
      throw new TypeError(`step.inheritance.${field} is invalid`);
    }
  }
  assertId(value.sourceControlId, 'step.inheritance.sourceControlId');
  assertInheritancePath(value.sourceRunRecord, 'step.inheritance.sourceRunRecord');
  if (!Array.isArray(value.evidenceFiles) || value.evidenceFiles.length === 0) {
    throw new TypeError('step.inheritance.evidenceFiles must be a non-empty array');
  }
  for (const file of value.evidenceFiles) {
    assertInheritancePath(file, 'step.inheritance.evidenceFiles item');
  }
  if (new Set(value.evidenceFiles).size !== value.evidenceFiles.length) {
    throw new TypeError('step.inheritance.evidenceFiles must not contain duplicates');
  }
  return { ...value, evidenceFiles: [...value.evidenceFiles].sort() };
}

function assertInheritancePath(value, label) {
  if (
    typeof value !== 'string' ||
    !value.startsWith('fast-proof/.tmp/') ||
    value.includes('\\') ||
    value.split('/').some((part) => part === '' || part === '.' || part === '..')
  ) {
    throw new TypeError(`${label} must be a safe inherited artifact path`);
  }
}

function parsePopulation(value) {
  if (value === null) return null;
  assertObject(value, 'step.population');
  if (value.scope !== 'repo-wide') throw new TypeError('step.population.scope is invalid');
  if (value.populationKind === 'repository-files') {
    assertExactKeys(value, ['scope', 'populationKind', 'scannedFileCount'], 'step.population');
    assertNonNegativeInteger(value.scannedFileCount, 'step.population.scannedFileCount');
    return { ...value };
  }
  if (value.populationKind === 'repository-state') {
    assertExactKeys(value, ['scope', 'populationKind'], 'step.population');
    return { ...value };
  }
  if (value.populationKind === 'external-report') {
    assertExactKeys(
      value,
      ['scope', 'populationKind', 'reportPath', 'reportDigest', 'observedAt'],
      'step.population'
    );
    if (typeof value.reportPath !== 'string' || value.reportPath.length === 0) {
      throw new TypeError('step.population.reportPath is invalid');
    }
    if (!/^sha256:[a-f0-9]{64}$/u.test(value.reportDigest ?? '')) {
      throw new TypeError('step.population.reportDigest is invalid');
    }
    assertIsoTimestamp(value.observedAt, 'step.population.observedAt');
    return { ...value };
  }
  throw new TypeError('step.population.populationKind is invalid');
}

export function parseStep(value, { legacy = false } = {}) {
  assertObject(value, 'step');
  assertExactKeys(value, legacy ? LEGACY_STEP_KEYS : STEP_KEYS, 'step');
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
  if (!legacy && (value.outcome === 'inherited') !== (value.inheritance !== null)) {
    throw new TypeError('step.inheritance is required only for inherited steps');
  }
  const requiresProblem = ['problems-found', 'blocked', 'error', 'interrupted'].includes(
    value.outcome
  );
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
    ...(legacy ? {} : { population: parsePopulation(value.population) }),
    ...(legacy ? {} : { inheritance: parseInheritance(value.inheritance) }),
  };
}

export function parseRunRecord(value) {
  assertObject(value, 'run record');
  const isLegacyV2 = value.schemaVersion === 2;
  const isLegacyV3 = value.schemaVersion === 3;
  const isLegacyV4 = value.schemaVersion === 4;
  assertExactKeys(
    value,
    isLegacyV2 ? V2_RECORD_KEYS : isLegacyV3 || isLegacyV4 ? RECORD_KEYS : V5_RECORD_KEYS,
    'run record'
  );
  if (
    !isLegacyV2 &&
    !isLegacyV3 &&
    !isLegacyV4 &&
    value.schemaVersion !== OBSERVABILITY_SCHEMA_VERSION
  ) {
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
    steps: value.steps.map((step) => parseStep(step, { legacy: isLegacyV2 || isLegacyV3 })),
    ...(isLegacyV2 ? {} : { timeline: parseTimeline(value.timeline) }),
    ...(isLegacyV2 || isLegacyV3 || isLegacyV4
      ? {}
      : {
          preflightContext: parsePreflightContext(value.preflightContext),
          changeRisk: parseChangeRisk(value.changeRisk),
          advisory: parseAdvisory(value.advisory),
        }),
    log: parseLog(value.log, value),
  };
  assertLifecycleConsistency(record);
  return record;
}
