import fs from 'node:fs';
import path from 'node:path';

import { expect, it } from 'vitest';

import { createTempRoot, importFresh, withCwd } from './test-helpers';

it('prints a stable no-history summary when no successful runs exist yet', async () => {
  const root = createTempRoot('verify-run-metrics-empty-');

  await withCwd(root, async () => {
    const metrics = await importFresh<typeof import('./verify-run-metrics.helpers.mjs')>(
      './verify-run-metrics.helpers.mjs'
    );

    expect(metrics.formatRunStatsLine('qa:build')).toBe(
      'Run timing (last 10 successful qa:build runs): no successful history yet'
    );
  });
});

it('reads legacy successful durations without permitting new JSONL writes', async () => {
  const root = createTempRoot('verify-run-metrics-history-');

  await withCwd(root, async () => {
    const metrics = await importFresh<typeof import('./verify-run-metrics.helpers.mjs')>(
      './verify-run-metrics.helpers.mjs'
    );
    const baseTime = 1_700_000_000_000;
    const legacyPath = path.join(root, '.tmp/qa/wrapper-run-metrics/qa-build.jsonl');
    fs.mkdirSync(path.dirname(legacyPath), { recursive: true });
    fs.writeFileSync(
      legacyPath,
      Array.from({ length: 12 }, (_, index) => {
        const durationMs = (index + 1) * 1000;
        const finishedAtMs = baseTime + index * 60_000;
        return JSON.stringify({ finishedAt: new Date(finishedAtMs).toISOString(), durationMs });
      }).join('\n') + '\n'
    );

    const recentRuns = metrics.readRecentSuccessfulRuns('qa:build');
    const stats = metrics.getRecentRunStats('qa:build');

    expect(recentRuns).toHaveLength(10);
    expect(stats).toEqual({
      runCount: 10,
      minDurationMs: 3000,
      averageDurationMs: 7500,
      maxDurationMs: 12000,
    });
    expect(metrics.formatRunStatsLine('qa:build')).toBe(
      'Run timing (last 10 successful qa:build runs): min=3.0s avg=7.5s max=12s'
    );
    expect(() => metrics.recordSuccessfulRun('qa:build', baseTime)).toThrow(/read-only/u);
  });
});
