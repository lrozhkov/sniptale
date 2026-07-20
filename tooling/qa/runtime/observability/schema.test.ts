import { describe, expect, it } from 'vitest';

import {
  parseCorrelation,
  parseRunRecord,
  readCorrelationEnvironment,
  readRunIdentityEnvironment,
} from './schema.mjs';
import { MAX_REPOSITORY_TARGET_FILES } from './constants.mjs';

function validRepository() {
  return {
    head: 'a'.repeat(40),
    treeFingerprint: 'b'.repeat(40),
    diffFingerprint: 'c'.repeat(64),
    changedFileCount: 2,
    scope: 'workspace',
    suite: null,
    mode: 'default',
    targetFiles: ['apps/extension/src/index.ts'],
  };
}

function validStep() {
  return {
    stepId: 'typescript.typecheck',
    outcome: 'passed',
    startedAt: '2026-07-14T10:00:00.000Z',
    finishedAt: '2026-07-14T10:00:01.000Z',
    durationMs: 1000,
    controlIds: ['typescript.typecheck'],
    problemIds: [],
    skipReasonId: null,
    diagnostic: null,
  };
}

function validRecord() {
  return {
    schemaVersion: 2,
    runId: '018f68b2-6e52-7cb0-bdb7-7f0a901c94de',
    rootRunId: '018f68b2-6e52-7cb0-bdb7-7f0a901c94de',
    parentRunId: null,
    ownerPid: 42,
    wrapperId: 'qa.checkpoint',
    status: 'all-passed',
    exitCode: 0,
    startedAt: '2026-07-14T10:00:00.000Z',
    finishedAt: '2026-07-14T10:00:01.000Z',
    durationMs: 1000,
    repository: validRepository(),
    correlation: { taskId: 'task-42' },
    summary: {
      stepCount: 1,
      passed: 1,
      problemsFound: 0,
      skipped: 0,
      errors: 0,
      interrupted: 0,
      problemCount: 0,
      problemIds: [],
    },
    steps: [validStep()],
    log: {
      path: '.tmp/qa-logs/2026-07-14/018f68b2-6e52-7cb0-bdb7-7f0a901c94de.log',
      digest: '0'.repeat(64),
      byteCount: 0,
      truncated: false,
    },
  };
}

describe('repository target manifest bounds', () => {
  it('accepts a complete initial-push target manifest for the current repository scale', () => {
    const record = validRecord();
    record.repository.targetFiles = Array.from(
      { length: 13_036 },
      (_, index) => `src/generated/file-${index}.ts`
    );

    expect(parseRunRecord(record).repository.targetFiles).toHaveLength(13_036);
  });

  it('rejects an initial-push target manifest above the observability bound', () => {
    const record = validRecord();
    record.repository.targetFiles = Array.from(
      { length: MAX_REPOSITORY_TARGET_FILES + 1 },
      (_, index) => `src/generated/file-${index}.ts`
    );

    expect(() => parseRunRecord(record)).toThrow(/bounded array/u);
  });
});

describe('parseRunRecord', () => {
  it('accepts the strict v2 record shape', () => {
    expect(parseRunRecord(validRecord())).toEqual(validRecord());
  });

  it.each(['argv', 'env', 'commitMessage', 'user', 'host'])('rejects leaked %s fields', (field) => {
    expect(() => parseRunRecord({ ...validRecord(), [field]: 'must-not-persist' })).toThrow(
      /unsupported fields/u
    );
  });

  it('rejects inconsistent summaries and unidentified failures', () => {
    const record = validRecord();
    record.steps[0] = { ...record.steps[0], outcome: 'error' };
    expect(() => parseRunRecord(record)).toThrow(/problemIds/u);
  });

  it('rejects unsafe repository targets and invalid lineage', () => {
    const unsafeTarget = validRecord();
    unsafeTarget.repository.targetFiles = ['../outside'];
    expect(() => parseRunRecord(unsafeTarget)).toThrow(/repository-relative paths/u);

    const invalidLineage = validRecord();
    invalidLineage.rootRunId = 'different-root';
    expect(() => parseRunRecord(invalidLineage)).toThrow(/identify itself/u);
  });

  it('requires a stable skip reason only for skipped steps', () => {
    const missingReason = validRecord();
    missingReason.steps[0] = {
      ...missingReason.steps[0],
      outcome: 'skipped',
    };
    missingReason.summary = {
      ...missingReason.summary,
      passed: 0,
      skipped: 1,
    };
    expect(() => parseRunRecord(missingReason)).toThrow(/skipReasonId/u);

    const unexpectedReason = validRecord();
    unexpectedReason.steps[0] = {
      ...unexpectedReason.steps[0],
      skipReasonId: 'scope.no-targets',
    };
    expect(() => parseRunRecord(unexpectedReason)).toThrow(/skipReasonId/u);
  });
});

describe('structured run diagnostics', () => {
  it('validates structured diagnostics and timestamp consistency', () => {
    const diagnosticRecord = validRecord();
    diagnosticRecord.steps[0] = {
      ...diagnosticRecord.steps[0],
      diagnostic: {
        summary: 'child build failed',
        locations: [{ file: 'tooling/qa/file.mjs', line: 17, message: 'invalid owner' }],
        remediation: 'Correct the owning wrapper before rerunning the canonical proof.',
        ruleDoc: 'docs/tooling/wrapper-summary.md',
        evidence: [
          {
            kind: 'child-run',
            runId: 'child-run-17',
            recordPath: '.tmp/qa-observability/runs/2026-07-14/child-run-17.json',
            logPath: '.tmp/qa-logs/2026-07-14/child-run-17.log',
          },
        ],
      },
    };
    expect(parseRunRecord(diagnosticRecord).steps[0].diagnostic).not.toBeNull();

    const mismatchedEvidence = structuredClone(diagnosticRecord);
    mismatchedEvidence.steps[0].diagnostic.evidence[0].runId = 'different-child';
    expect(() => parseRunRecord(mismatchedEvidence)).toThrow(/declared child run/u);

    const inconsistent = validRecord();
    inconsistent.steps[0] = { ...inconsistent.steps[0], durationMs: 999 };
    expect(() => parseRunRecord(inconsistent)).toThrow(/timestamp interval/u);

    const inconsistentRun = validRecord();
    inconsistentRun.durationMs = 999;
    expect(() => parseRunRecord(inconsistentRun)).toThrow(/run durationMs/u);
  });
});

describe('parseCorrelation', () => {
  it('accepts only allowlisted opaque identifiers', () => {
    expect(parseCorrelation({ taskId: 'codex:task-42', workflowId: 'workflow.17' })).toEqual({
      taskId: 'codex:task-42',
      workflowId: 'workflow.17',
    });
    expect(() => parseCorrelation({ branch: 'main' })).toThrow(/unsupported fields/u);
    expect(() => parseCorrelation({ taskId: '/home/person/private task' })).toThrow(/opaque/u);
  });

  it('reads only explicitly allowlisted environment fields', () => {
    expect(
      readCorrelationEnvironment({
        SNIPTALE_QA_TASK_ID: 'task-42',
        SECRET_TOKEN: 'must-not-leak',
        USER: 'must-not-leak',
      })
    ).toEqual({ taskId: 'task-42' });
    expect(readCorrelationEnvironment({ CODEX_THREAD_ID: 'thread-17' })).toEqual({
      taskId: 'thread-17',
    });
  });
});

it('validates only explicit run lineage environment fields', () => {
  expect(
    readRunIdentityEnvironment({
      SNIPTALE_QA_RUN_ID: 'build-17',
      SNIPTALE_QA_ROOT_RUN_ID: 'closeout-17',
      SNIPTALE_QA_PARENT_RUN_ID: 'closeout-17',
      SNIPTALE_QA_TASK_ID: 'not-lineage',
    })
  ).toEqual({ runId: 'build-17', rootRunId: 'closeout-17', parentRunId: 'closeout-17' });
  expect(() => readRunIdentityEnvironment({ SNIPTALE_QA_RUN_ID: '../unsafe' })).toThrow(
    /stable lowercase identifier/u
  );
});
