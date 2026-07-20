import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

import { createTempRoot, initGitRepo, runGit, writeFile } from '../../core/test-helpers';
import { enforceRetention, recoverStaleRuns } from './maintenance.mjs';
import { createObservabilityRun } from './run.mjs';
import { collectRunStatistics } from './statistics.mjs';

function createRepository(prefix: string) {
  const root = createTempRoot(prefix);
  initGitRepo(root);
  writeFile(root, 'tracked.txt', 'stable\n');
  runGit(root, 'add', 'tracked.txt');
  runGit(root, 'commit', '-m', 'initial');
  return root;
}

it('recovers abandoned running records as interrupted', () => {
  const root = createRepository('qa-observability-recovery-');
  const startedAt = Date.parse('2026-07-14T01:00:00.000Z');
  const run = createObservabilityRun({
    wrapperId: 'qa.release-harness',
    rootDir: root,
    clock: () => startedAt,
    createId: () => '418f68b2-6e52-7cb0-bdb7-7f0a901c94de',
  });
  const recovered = recoverStaleRuns({
    rootDir: root,
    now: startedAt + 10_000,
    staleAfterMs: 1000,
    isOwnerAlive: () => false,
  });
  const record = JSON.parse(fs.readFileSync(run.runPath, 'utf8'));

  expect(recovered).toEqual([run.runId]);
  expect(record.status).toBe('interrupted');
  expect(record.exitCode).toBe(143);
  expect(record.summary.problemIds).toEqual(['wrapper.interrupted.stale-run']);
  expect(fs.readFileSync(run.logPath, 'utf8')).toContain('recovered as interrupted');
  const persisted = JSON.parse(fs.readFileSync(run.runPath, 'utf8'));
  expect(persisted.log.byteCount).toBe(Buffer.byteLength(fs.readFileSync(run.logPath)));
  expect(persisted.log.digest).toMatch(/^[a-f0-9]{64}$/u);
});

it('does not recover an old record while its owner process remains alive', () => {
  const root = createRepository('qa-observability-live-owner-');
  const startedAt = Date.parse('2026-07-14T01:00:00.000Z');
  const run = createObservabilityRun({
    wrapperId: 'qa.release-harness',
    rootDir: root,
    clock: () => startedAt,
    createId: () => 'a18f68b2-6e52-7cb0-bdb7-7f0a901c94de',
  });
  const recovered = recoverStaleRuns({
    rootDir: root,
    now: startedAt + 10_000,
    staleAfterMs: 1000,
    isOwnerAlive: () => true,
  });

  expect(recovered).toEqual([]);
  expect(JSON.parse(fs.readFileSync(run.runPath, 'utf8')).status).toBe('running');
});

it('aggregates wrapper, control and opaque task statistics', () => {
  const root = createRepository('qa-observability-stats-');
  const run = createObservabilityRun({
    wrapperId: 'qa.checkpoint',
    correlation: { taskId: 'task-17' },
    rootDir: root,
    createId: () => '518f68b2-6e52-7cb0-bdb7-7f0a901c94de',
  });
  run.addStep({
    stepId: 'typescript.typecheck',
    outcome: 'problems-found',
    controlIds: ['typescript.typecheck'],
    problemIds: ['typescript.typecheck.failed'],
  });
  run.addStep({
    stepId: 'coverage.diff',
    outcome: 'skipped',
    controlIds: ['coverage.diff'],
    skipReasonId: 'scope.no-product-files',
  });
  run.finalize();
  const stats = collectRunStatistics({ rootDir: root });

  expect(stats.overall).toMatchObject({
    total: 1,
    problemsFound: 1,
    problemCount: 1,
    passRate: 0,
    timing: { p50Ms: expect.any(Number), p95Ms: expect.any(Number) },
  });
  expect(stats.wrappers).toMatchObject([{ id: 'qa.checkpoint', problemsFound: 1 }]);
  expect(stats.modes).toMatchObject([{ id: 'qa.checkpoint/default', problemsFound: 1 }]);
  expect(stats.controls).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: 'typescript.typecheck', problemsFound: 1 }),
    ])
  );
  expect(stats.steps).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: 'coverage.diff', skipped: 1 }),
      expect.objectContaining({ id: 'typescript.typecheck', problemsFound: 1 }),
    ])
  );
  expect(stats.skipReasons).toEqual([{ id: 'scope.no-product-files', total: 1 }]);
  expect(stats.problems).toEqual([{ id: 'typescript.typecheck.failed', total: 1 }]);
  expect(stats.tasks).toMatchObject([{ id: 'task-17', problemsFound: 1 }]);
});

it('excludes skipped runs from aggregate pass rates', () => {
  const root = createRepository('qa-observability-skipped-stats-');
  const skipped = createObservabilityRun({
    wrapperId: 'qa.release-harness',
    rootDir: root,
    createId: () => 'a28f68b2-6e52-7cb0-bdb7-7f0a901c94de',
  });
  skipped.addStep({
    stepId: 'qa.rule.harness-vitest',
    outcome: 'skipped',
    skipReasonId: 'no-applicable-targets',
  });
  skipped.finalize({ status: 'skipped' });
  const passed = createObservabilityRun({
    wrapperId: 'qa.release-harness',
    rootDir: root,
    createId: () => 'b28f68b2-6e52-7cb0-bdb7-7f0a901c94de',
  });
  passed.addStep({ stepId: 'qa.rule.harness-vitest', outcome: 'passed' });
  passed.finalize();

  expect(collectRunStatistics({ rootDir: root }).overall).toMatchObject({
    total: 2,
    allPassed: 1,
    skipped: 1,
    passRate: 1,
  });
});

describe('completed-run retention', () => {
  it('removes old run/log pairs and bounds invalid/orphan quarantine', () => {
    const root = createRepository('qa-observability-retention-');
    const firstTime = Date.parse('2026-07-13T01:00:00.000Z');
    const first = createObservabilityRun({
      wrapperId: 'qa.audit',
      rootDir: root,
      clock: () => firstTime,
      createId: () => '618f68b2-6e52-7cb0-bdb7-7f0a901c94de',
    });
    first.finalize();
    const second = createObservabilityRun({
      wrapperId: 'qa.audit',
      rootDir: root,
      clock: () => firstTime + 1000,
      createId: () => '718f68b2-6e52-7cb0-bdb7-7f0a901c94de',
    });
    second.finalize();
    const invalidPath = `${second.runPath}.invalid.json`;
    fs.writeFileSync(invalidPath, '{invalid');
    const orphanLogPath = `${second.logPath}.orphan.log`;
    fs.writeFileSync(orphanLogPath, 'orphan');

    const removed = enforceRetention({
      rootDir: root,
      now: firstTime + 2000,
      maximumAgeMs: 10_000,
      maximumRuns: 1,
      maximumInvalidRecords: 0,
      maximumOrphanLogs: 0,
    });

    expect(removed).toEqual([first.runId]);
    expect(fs.existsSync(first.runPath)).toBe(false);
    expect(fs.existsSync(first.logPath)).toBe(false);
    expect(fs.existsSync(second.runPath)).toBe(true);
    expect(fs.existsSync(invalidPath)).toBe(false);
    expect(fs.existsSync(orphanLogPath)).toBe(false);
    expect(collectRunStatistics({ rootDir: root }).invalidRecordCount).toBe(0);
  });
});

describe('diagnostic quarantine retention', () => {
  it('keeps only the bounded recent invalid records and orphan logs', () => {
    const root = createRepository('qa-observability-quarantine-');
    const runsRoot = `${root}/.tmp/qa-observability/runs/2026-07-14`;
    const logsRoot = `${root}/.tmp/qa-logs/2026-07-14`;
    fs.mkdirSync(runsRoot, { recursive: true });
    fs.mkdirSync(logsRoot, { recursive: true });
    for (const name of ['old', 'new']) {
      fs.writeFileSync(`${runsRoot}/${name}.json`, '{invalid');
      fs.writeFileSync(`${logsRoot}/${name}.log`, name);
    }
    const now = Date.now();
    fs.utimesSync(`${runsRoot}/old.json`, new Date(now - 2000), new Date(now - 2000));
    fs.utimesSync(`${logsRoot}/old.log`, new Date(now - 2000), new Date(now - 2000));

    enforceRetention({
      rootDir: root,
      now,
      maximumAgeMs: 10_000,
      maximumInvalidRecords: 1,
      maximumOrphanLogs: 1,
    });

    expect(fs.existsSync(`${runsRoot}/old.json`)).toBe(false);
    expect(fs.existsSync(`${logsRoot}/old.log`)).toBe(false);
    expect(fs.existsSync(`${runsRoot}/new.json`)).toBe(true);
    expect(fs.existsSync(`${logsRoot}/new.log`)).toBe(true);
  });
});

describe('protected-run retention', () => {
  it('protects every running record and the latest completed record', () => {
    const root = createRepository('qa-observability-retention-protected-');
    const firstTime = Date.parse('2026-07-01T01:00:00.000Z');
    const old = createObservabilityRun({
      wrapperId: 'qa.audit',
      rootDir: root,
      clock: () => firstTime,
      createId: () => 'b18f68b2-6e52-7cb0-bdb7-7f0a901c94de',
    });
    old.finalize();
    const latest = createObservabilityRun({
      wrapperId: 'qa.audit',
      rootDir: root,
      clock: () => firstTime + 1000,
      createId: () => 'c18f68b2-6e52-7cb0-bdb7-7f0a901c94de',
    });
    latest.finalize();
    const running = createObservabilityRun({
      wrapperId: 'qa.audit',
      rootDir: root,
      clock: () => firstTime + 2000,
      createId: () => 'd18f68b2-6e52-7cb0-bdb7-7f0a901c94de',
    });

    expect(
      enforceRetention({
        rootDir: root,
        now: firstTime + 100_000,
        maximumAgeMs: 0,
        maximumRuns: 0,
      })
    ).toEqual([old.runId]);
    expect(fs.existsSync(latest.runPath)).toBe(true);
    expect(fs.existsSync(running.runPath)).toBe(true);
  });
});
