export const OBSERVABILITY_SCHEMA_VERSION = 2;
export const MAX_REPOSITORY_TARGET_FILES = 25_000;

export const DEFAULT_PATHS = Object.freeze({
  runs: '.tmp/qa-observability/runs',
  logs: '.tmp/qa-logs',
});

export const OBSERVABILITY_ROOT_ENV = 'SNIPTALE_QA_OBSERVABILITY_ROOT';

export const DEFAULT_LIMITS = Object.freeze({
  logBytes: 256 * 1024,
  retainedRuns: 500,
  retainedInvalidRecords: 25,
  retainedOrphanLogs: 25,
  retentionAgeMs: 30 * 24 * 60 * 60 * 1000,
  staleRunAgeMs: 6 * 60 * 60 * 1000,
});

export const RUN_STATUSES = Object.freeze([
  'running',
  'all-passed',
  'skipped',
  'problems-found',
  'interrupted',
]);

export const STEP_OUTCOMES = Object.freeze([
  'passed',
  'problems-found',
  'skipped',
  'error',
  'interrupted',
]);

export const CORRELATION_KEYS = Object.freeze(['taskId', 'workflowId']);
export const RUN_ID_ENVIRONMENT_KEYS = Object.freeze({
  runId: 'SNIPTALE_QA_RUN_ID',
  rootRunId: 'SNIPTALE_QA_ROOT_RUN_ID',
  parentRunId: 'SNIPTALE_QA_PARENT_RUN_ID',
});
