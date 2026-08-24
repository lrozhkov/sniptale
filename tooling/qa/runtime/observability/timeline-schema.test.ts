import { expect, it } from 'vitest';

import { parseTimeline } from './timeline-schema.mjs';

const at = '2026-08-23T10:00:00.000Z';
const later = '2026-08-23T10:00:00.001Z';

function completed(activityId: string, dependencies: string[] = []) {
  return {
    activityId,
    kind: 'scheduler-lane',
    state: 'completed',
    queuedAt: at,
    startedAt: at,
    finishedAt: later,
    durationMs: 1,
    queueDurationMs: 0,
    dependencies,
    waitReasons: [],
    waitDurations: { dependencyMs: 0, resourceTokensMs: 0, concurrencyLimitMs: 0 },
    executionProfile: {
      cpuTokens: 1,
      memoryMiB: 128,
      workers: 1,
      pid: 17,
      workerId: null,
      checkerCount: 2,
      toolName: 'typescript',
      toolVersion: '7.0.2',
    },
    reused: false,
  };
}

function events(...ids: string[]) {
  return [
    ...ids.flatMap((activityId) => [
      { sequence: 0, activityId, state: 'queued', at },
      { sequence: 0, activityId, state: 'started', at },
    ]),
    ...ids.map((activityId) => ({
      sequence: 0,
      activityId,
      state: 'completed',
      at: later,
    })),
  ].map((event, sequence) => ({ ...event, sequence }));
}

it('rejects cyclic activity dependencies', () => {
  expect(() =>
    parseTimeline({
      activities: [completed('lane.a', ['lane.b']), completed('lane.b', ['lane.a'])],
      events: events('lane.a', 'lane.b'),
    })
  ).toThrow(/acyclic/u);
});

it('rejects invalid state progression and non-monotonic events', () => {
  const invalidState = events('lane.a');
  invalidState[2] = { ...invalidState[2], state: 'failed' };
  expect(() => parseTimeline({ activities: [completed('lane.a')], events: invalidState })).toThrow(
    /incomplete/u
  );

  const nonMonotonic = events('lane.a', 'lane.b');
  nonMonotonic[3] = { ...nonMonotonic[3], at: '2026-08-23T09:59:59.999Z' };
  expect(() =>
    parseTimeline({ activities: [completed('lane.a'), completed('lane.b')], events: nonMonotonic })
  ).toThrow(/monotonic/u);
});
