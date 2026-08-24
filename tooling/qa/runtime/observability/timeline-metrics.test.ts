import { expect, it } from 'vitest';

import { summarizeTimeline } from './timeline-metrics.mjs';

function activity(
  activityId: string,
  startedAt: string,
  finishedAt: string,
  dependencies: string[] = [],
  waitDurations = { dependencyMs: 0, resourceTokensMs: 0, concurrencyLimitMs: 0 }
) {
  return {
    activityId,
    state: 'completed',
    startedAt,
    finishedAt,
    durationMs: Date.parse(finishedAt) - Date.parse(startedAt),
    queueDurationMs: 0,
    dependencies,
    waitDurations,
    reused: false,
  };
}

it('keeps a dependency critical path bounded by real wall-clock intervals', () => {
  const start = '2026-08-23T10:00:00.000Z';
  const middle = '2026-08-23T10:00:00.100Z';
  const finish = '2026-08-23T10:00:00.200Z';
  const summary = summarizeTimeline({
    startedAt: start,
    durationMs: 200,
    timeline: {
      activities: [
        activity('lane.a', start, middle),
        activity('lane.b', middle, finish, ['lane.a']),
        activity('worker.bootstrap', middle, finish),
      ],
    },
  });

  expect(summary.criticalPathMs).toBe(200);
  expect(summary.criticalPathMs).toBeLessThanOrEqual(summary.wallClockMs);
  expect(summary.criticalPath).toEqual(['lane.a', 'lane.b']);
  expect(summary.activeExecutionMs).toBe(200);
});

it('counts only explicit resource and concurrency waits as resource wait', () => {
  const start = '2026-08-23T10:00:00.000Z';
  const finish = '2026-08-23T10:00:00.100Z';
  const summary = summarizeTimeline({
    startedAt: start,
    durationMs: 100,
    timeline: {
      activities: [
        activity('lane.waited', start, finish, [], {
          dependencyMs: 30,
          resourceTokensMs: 20,
          concurrencyLimitMs: 10,
        }),
      ],
    },
  });

  expect(summary.resourceWaitMs).toBe(30);
});
