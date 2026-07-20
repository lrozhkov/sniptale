import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { createTempRoot, initGitRepo, runGit, writeFile } from '../../core/test-helpers';
import { createObservabilityRun } from './run.mjs';
import { parseRunRecord } from './schema.mjs';

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
