import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { createTempRoot, initGitRepo, runGit, writeFile } from '../../core/test-helpers';
import { createObservabilityRun } from './run.mjs';
import { parseRunRecord } from './schema.mjs';
import { withObservabilityTimeline } from './timeline-context.mjs';
import { runBoundedTasks } from '../task-scheduler.mjs';

function createRepository(prefix: string) {
  const root = createTempRoot(prefix);
  initGitRepo(root);
  writeFile(root, 'tracked.txt', 'stable\n');
  runGit(root, 'add', 'tracked.txt');
  runGit(root, 'commit', '-m', 'initial');
  return root;
}

describe('successful observability run persistence', () => {
  it('persists an atomic lifecycle record with repository context and a private log', () => {
    const root = createRepository('qa-observability-lifecycle-');
    writeFile(root, 'tracked.txt', 'changed\n');
    let now = Date.parse('2026-07-14T10:00:00.000Z');
    const run = createObservabilityRun({
      wrapperId: 'qa.checkpoint',
      rootDir: root,
      clock: () => now,
      createId: () => '018f68b2-6e52-7cb0-bdb7-7f0a901c94de',
    });
    now += 1250;
    run.addStep({
      stepId: 'typescript.typecheck',
      outcome: 'passed',
      controlIds: ['typescript.typecheck'],
      log: `repo=${root}`,
    });
    const finalRecord = run.finalize();
    const persisted = parseRunRecord(JSON.parse(fs.readFileSync(run.runPath, 'utf8')));

    expect(finalRecord.status).toBe('all-passed');
    expect(finalRecord.exitCode).toBe(0);
    expect(persisted.durationMs).toBe(1250);
    expect(persisted.repository.head).toMatch(/^[a-f0-9]{40}$/u);
    expect(persisted.repository.diffFingerprint).toMatch(/^[a-f0-9]{64}$/u);
    expect(persisted.repository.changedFileCount).toBe(1);
    expect(persisted.log).toMatchObject({
      byteCount: Buffer.byteLength(fs.readFileSync(run.logPath)),
      truncated: false,
    });
    expect(persisted.log.digest).toMatch(/^[a-f0-9]{64}$/u);
    expect(fs.readFileSync(run.logPath, 'utf8')).toContain('repo=<repo>');
    expect(fs.readdirSync(path.dirname(run.runPath))).toEqual([path.basename(run.runPath)]);
    if (process.platform !== 'win32') {
      expect(fs.statSync(run.runPath).mode & 0o777).toBe(0o600);
      expect(fs.statSync(run.logPath).mode & 0o777).toBe(0o600);
    }
  });

  it('uses normalized AST/report console bounds without breaking UTF-8', () => {
    const root = createRepository('qa-observability-console-');
    const run = createObservabilityRun({ wrapperId: 'qa.advisory', rootDir: root });
    run.addSensitiveValues(['private-console-value']);
    const output = run.sanitizeConsoleOutput(
      `${root} private-console-value ${'с'.repeat(20_000)}`,
      1024
    );
    expect(Buffer.byteLength(output)).toBeLessThanOrEqual(1024);
    expect(output).toContain('<repo>');
    expect(output).toContain('<redacted>');
    expect(output).not.toContain('\ufffd');
    expect(output).toContain('console output truncated');
    run.finalize();
  });
});

describe('failed observability run persistence', () => {
  it('records sanitized failures and rejects mutation after finalization', () => {
    const root = createRepository('qa-observability-failure-');
    const run = createObservabilityRun({
      wrapperId: 'qa.build',
      rootDir: root,
      createId: () => '118f68b2-6e52-7cb0-bdb7-7f0a901c94de',
    });
    const result = run.fail(new Error('token=secret-value at /home/private/source.ts'));
    const log = fs.readFileSync(run.logPath, 'utf8');

    expect(result.status).toBe('problems-found');
    expect(result.exitCode).toBe(1);
    expect(result.summary.problemIds).toEqual(['wrapper.unhandled-error']);
    expect(log).toContain('token=<redacted>');
    expect(log).not.toContain('secret-value');
    expect(log).not.toContain('/home/private');
    expect(() => run.finalize()).toThrow(/already finalized/u);
  });
});

describe('skipped observability run persistence', () => {
  it('persists a successful skipped run without counting it as passed', () => {
    const root = createRepository('qa-observability-skipped-');
    const run = createObservabilityRun({
      wrapperId: 'qa.release-harness',
      rootDir: root,
      createId: () => 'f18f68b2-6e52-7cb0-bdb7-7f0a901c94de',
    });
    run.addStep({
      stepId: 'qa.rule.harness-vitest',
      outcome: 'skipped',
      skipReasonId: 'no-applicable-targets',
    });

    const record = run.finalize({ status: 'skipped' });
    expect(record).toMatchObject({ status: 'skipped', exitCode: 0 });
  });
});

describe('observability run isolation', () => {
  it('keeps concurrent invocations in separate run and log files', () => {
    const root = createRepository('qa-observability-concurrency-');
    const first = createObservabilityRun({
      wrapperId: 'qa.audit',
      rootDir: root,
      createId: () => '218f68b2-6e52-7cb0-bdb7-7f0a901c94de',
    });
    const second = createObservabilityRun({
      wrapperId: 'qa.audit',
      rootDir: root,
      createId: () => '318f68b2-6e52-7cb0-bdb7-7f0a901c94de',
    });
    first.finalize();
    second.interrupt('SIGTERM');

    expect(first.runPath).not.toBe(second.runPath);
    expect(first.logPath).not.toBe(second.logPath);
    expect(JSON.parse(fs.readFileSync(second.runPath, 'utf8')).status).toBe('interrupted');
  });

  it('refuses a run identifier collision without replacing the first record', () => {
    const root = createRepository('qa-observability-id-collision-');
    const createId = () => '818f68b2-6e52-7cb0-bdb7-7f0a901c94de';
    const first = createObservabilityRun({ wrapperId: 'qa.audit', rootDir: root, createId });
    const original = fs.readFileSync(first.runPath, 'utf8');

    expect(() =>
      createObservabilityRun({ wrapperId: 'qa.checkpoint', rootDir: root, createId })
    ).toThrow();
    expect(fs.readFileSync(first.runPath, 'utf8')).toBe(original);
  });
});

describe('observability repeated control execution', () => {
  it('records repeated executions of the same stable control in order', () => {
    const root = createRepository('qa-observability-repeat-control-');
    const run = createObservabilityRun({
      wrapperId: 'qa.checkpoint',
      rootDir: root,
      createId: () => 'e18f68b2-6e52-7cb0-bdb7-7f0a901c94de',
    });
    run.addStep({ stepId: 'qa.rule.storage-write-patterns', outcome: 'passed' });
    run.addStep({
      stepId: 'qa.rule.storage-write-patterns',
      outcome: 'skipped',
      skipReasonId: 'no-applicable-targets',
    });

    const record = run.finalize();
    expect(record.steps.map(({ outcome }) => outcome)).toEqual(['passed', 'skipped']);
    expect(record.summary).toMatchObject({ passed: 1, skipped: 1, stepCount: 2 });
  });
});

describe('incremental activity timeline', () => {
  it('persists real queue, execution, reuse, skip, and interruption transitions atomically', () => {
    const root = createRepository('qa-observability-timeline-');
    let now = Date.parse('2026-08-23T10:00:00.000Z');
    const run = createObservabilityRun({
      wrapperId: 'ci.proof',
      rootDir: root,
      clock: () => now,
      createId: () => 'timeline-run-17',
    });
    run.recordActivityTransition({
      activityId: 'lane.light',
      kind: 'scheduler-lane',
      state: 'queued',
      reused: true,
    });
    now += 25;
    run.recordActivityTransition({
      activityId: 'lane.light',
      kind: 'scheduler-lane',
      state: 'started',
      waitReasons: ['resource-tokens'],
    });
    now += 75;
    run.recordActivityTransition({
      activityId: 'lane.light',
      kind: 'scheduler-lane',
      state: 'completed',
    });
    run.recordActivityTransition({
      activityId: 'control.reused',
      kind: 'audit-control',
      state: 'queued',
      reused: true,
    });
    run.recordActivityTransition({
      activityId: 'control.reused',
      kind: 'audit-control',
      state: 'skipped',
    });
    run.recordActivityTransition({
      activityId: 'lane.pending',
      kind: 'scheduler-lane',
      state: 'queued',
    });

    const incremental = parseRunRecord(JSON.parse(fs.readFileSync(run.runPath, 'utf8')));
    expect(
      incremental.timeline.activities.find(({ activityId }) => activityId === 'lane.light')
    ).toMatchObject({ durationMs: 75, queueDurationMs: 25, reused: true });

    now += 10;
    const interrupted = run.interrupt('SIGINT');
    expect(interrupted.timeline.activities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ activityId: 'control.reused', state: 'skipped' }),
        expect.objectContaining({ activityId: 'lane.pending', state: 'interrupted' }),
      ])
    );
  });

  it('persists distinct overlapping scheduler intervals instead of reconstructing them', async () => {
    const root = createRepository('qa-observability-parallel-');
    let now = Date.parse('2026-08-23T11:00:00.000Z');
    const run = createObservabilityRun({
      wrapperId: 'ci.proof',
      rootDir: root,
      clock: () => now,
      createId: () => 'parallel-run-17',
    });
    let resolveFirst!: () => void;
    let resolveSecond!: () => void;
    const first = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });
    const second = new Promise<void>((resolve) => {
      resolveSecond = resolve;
    });
    const scheduled = withObservabilityTimeline(run, () =>
      runBoundedTasks(
        [
          { id: 'first', cpuTokens: 1, memoryMiB: 256, run: () => first },
          { id: 'second', cpuTokens: 1, memoryMiB: 256, run: () => second },
        ],
        {
          now: () => now,
          profile: { cpuTokens: 2, memoryMiB: 512 },
          schedulerId: 'persisted',
        }
      )
    );
    await vi.waitFor(() => {
      expect(
        run.snapshot().timeline.activities.filter(({ state }) => state === 'started')
      ).toHaveLength(2);
    });
    now += 40;
    resolveFirst();
    await vi.waitFor(() =>
      expect(
        run
          .snapshot()
          .timeline.activities.find(({ activityId }) => activityId === 'persisted.lane.first')
          ?.finishedAt
      ).not.toBeNull()
    );
    now += 30;
    resolveSecond();
    await scheduled;
    const record = run.finalize();
    const firstActivity = record.timeline.activities.find(
      ({ activityId }) => activityId === 'persisted.lane.first'
    )!;
    const secondActivity = record.timeline.activities.find(
      ({ activityId }) => activityId === 'persisted.lane.second'
    )!;
    expect(firstActivity.startedAt).toBe(secondActivity.startedAt);
    expect(firstActivity.finishedAt).not.toBe(secondActivity.finishedAt);
    expect(Date.parse(secondActivity.startedAt!)).toBeLessThan(
      Date.parse(firstActivity.finishedAt!)
    );
  });
});

describe('observability repository routing and lineage', () => {
  it('stores temporary-worktree runs in an explicitly validated durable worktree', () => {
    const durableRoot = createRepository('qa-observability-durable-');
    const temporaryRoot = createRepository('qa-observability-temporary-');
    const run = createObservabilityRun({
      wrapperId: 'qa.pre-push',
      repositoryRoot: temporaryRoot,
      environment: { SNIPTALE_QA_OBSERVABILITY_ROOT: durableRoot },
      createId: () => '918f68b2-6e52-7cb0-bdb7-7f0a901c94de',
    });
    run.writeLog(`${temporaryRoot}\n${durableRoot}\n`);
    run.finalize();

    expect(run.runPath.startsWith(durableRoot)).toBe(true);
    expect(fs.readFileSync(run.logPath, 'utf8')).toBe('<repo>\n<repo>\n');
  });

  it('uses validated preassigned lineage and can attach bounded repository routing', () => {
    const root = createRepository('qa-observability-lineage-');
    const run = createObservabilityRun({
      wrapperId: 'qa.build',
      rootDir: root,
      environment: {
        SNIPTALE_QA_RUN_ID: 'build-run-17',
        SNIPTALE_QA_ROOT_RUN_ID: 'closeout-run-17',
        SNIPTALE_QA_PARENT_RUN_ID: 'closeout-run-17',
        CODEX_THREAD_ID: 'thread-42',
      },
    });
    run.attachRepositoryContext({
      scope: 'artifact-closure',
      suite: 'release',
      targetFiles: ['packages/ui/src/index.ts', 'apps/extension/src/index.ts'],
    });
    const record = run.finalize();

    expect(record).toMatchObject({
      runId: 'build-run-17',
      rootRunId: 'closeout-run-17',
      parentRunId: 'closeout-run-17',
      correlation: { taskId: 'thread-42' },
      repository: {
        scope: 'artifact-closure',
        suite: 'release',
        targetFiles: ['apps/extension/src/index.ts', 'packages/ui/src/index.ts'],
      },
    });
  });
});
