import { CORRELATION_KEYS, RUN_ID_ENVIRONMENT_KEYS } from './constants.mjs';
import { isOpaqueIdentifier } from './identifiers.mjs';
import {
  assertExactKeys,
  assertId,
  assertNonNegativeInteger,
  assertObject,
  assertStringArray,
} from './schema-assertions.mjs';

const LOG_KEYS = ['path', 'digest', 'byteCount', 'truncated'];
const REPOSITORY_KEYS = [
  'head',
  'treeFingerprint',
  'diffFingerprint',
  'changedFileCount',
  'scope',
  'suite',
  'mode',
  'targetFiles',
];
const SUMMARY_KEYS = [
  'stepCount',
  'passed',
  'problemsFound',
  'skipped',
  'errors',
  'interrupted',
  'problemCount',
  'problemIds',
];

export function parseCorrelation(value = {}) {
  assertObject(value, 'correlation');
  assertExactKeys(value, CORRELATION_KEYS, 'correlation');
  for (const [key, correlationValue] of Object.entries(value)) {
    if (!isOpaqueIdentifier(correlationValue)) {
      throw new TypeError(`correlation.${key} must be an opaque identifier`);
    }
  }
  return { ...value };
}

export function readCorrelationEnvironment(environment = process.env) {
  const taskId = environment.SNIPTALE_QA_TASK_ID ?? environment.CODEX_THREAD_ID;
  return parseCorrelation({
    ...(taskId === undefined ? {} : { taskId }),
    ...(environment.SNIPTALE_QA_WORKFLOW_ID === undefined
      ? {}
      : { workflowId: environment.SNIPTALE_QA_WORKFLOW_ID }),
  });
}

export function readRunIdentityEnvironment(environment = process.env) {
  const identity = {};
  for (const [field, environmentKey] of Object.entries(RUN_ID_ENVIRONMENT_KEYS)) {
    if (environment[environmentKey] !== undefined) {
      assertId(environment[environmentKey], environmentKey);
      identity[field] = environment[environmentKey];
    }
  }
  return identity;
}

function hasUnsafeControlCharacter(value) {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code <= 31 || code === 127) return true;
  }
  return false;
}

function assertTargetFile(value) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 4096 ||
    value.startsWith('/') ||
    value.includes('\\') ||
    hasUnsafeControlCharacter(value) ||
    value.split('/').some((part) => part === '' || part === '.' || part === '..')
  ) {
    throw new TypeError('repository.targetFiles must contain safe repository-relative paths');
  }
}

export function parseRepository(value) {
  assertObject(value, 'repository');
  assertExactKeys(value, REPOSITORY_KEYS, 'repository');
  for (const key of ['head', 'treeFingerprint', 'diffFingerprint']) {
    if (
      value[key] !== null &&
      (typeof value[key] !== 'string' || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(value[key]))
    ) {
      throw new TypeError(`repository.${key} must be a hex fingerprint or null`);
    }
  }
  assertNonNegativeInteger(value.changedFileCount, 'repository.changedFileCount');
  assertId(value.scope, 'repository.scope');
  if (value.suite !== null) assertId(value.suite, 'repository.suite');
  assertId(value.mode, 'repository.mode');
  if (!Array.isArray(value.targetFiles) || value.targetFiles.length > 10_000) {
    throw new TypeError('repository.targetFiles must be a bounded array');
  }
  for (const targetFile of value.targetFiles) assertTargetFile(targetFile);
  if (new Set(value.targetFiles).size !== value.targetFiles.length) {
    throw new TypeError('repository.targetFiles must not contain duplicates');
  }
  return { ...value, targetFiles: [...value.targetFiles].sort() };
}

export function parseSummary(value) {
  assertObject(value, 'summary');
  assertExactKeys(value, SUMMARY_KEYS, 'summary');
  for (const key of SUMMARY_KEYS.slice(0, -1)) {
    assertNonNegativeInteger(value[key], `summary.${key}`);
  }
  assertStringArray(value.problemIds, 'summary.problemIds');
  return { ...value, problemIds: [...value.problemIds].sort() };
}

export function parseLog(value, record) {
  assertObject(value, 'log');
  assertExactKeys(value, LOG_KEYS, 'log');
  const expectedPath = `.tmp/qa-logs/${record.startedAt.slice(0, 10)}/${record.runId}.log`;
  if (value.path !== expectedPath) {
    throw new TypeError('log.path must be the canonical path for this run');
  }
  if (typeof value.digest !== 'string' || !/^[a-f0-9]{64}$/u.test(value.digest)) {
    throw new TypeError('log.digest must be a SHA-256 digest');
  }
  assertNonNegativeInteger(value.byteCount, 'log.byteCount');
  if (typeof value.truncated !== 'boolean') throw new TypeError('log.truncated must be boolean');
  return { ...value };
}
