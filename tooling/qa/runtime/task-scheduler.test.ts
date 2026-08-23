import { expect, it, vi } from 'vitest';

import { runBoundedTasks } from './task-scheduler.mjs';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

const profile = { cpuTokens: 4, memoryMiB: 4096 };

it('backfills independent work without exceeding CPU or memory budgets', async () => {
  const first = deferred<string>();
  const second = deferred<string>();
  const started: string[] = [];
  const run = runBoundedTasks(
    [
      {
        id: 'first',
        cpuTokens: 2,
        memoryMiB: 2048,
        run: () => {
          started.push('first');
          return first.promise;
        },
      },
      {
        id: 'second',
        cpuTokens: 2,
        memoryMiB: 2048,
        run: () => {
          started.push('second');
          return second.promise;
        },
      },
      {
        id: 'third',
        cpuTokens: 1,
        memoryMiB: 1024,
        run: () => {
          started.push('third');
          return 'third';
        },
      },
    ],
    { profile }
  );

  await vi.waitFor(() => expect(started).toEqual(['first', 'second']));
  first.resolve('first');
  await vi.waitFor(() => expect(started).toContain('third'));
  second.resolve('second');

  expect((await run).map(({ id, value }) => [id, value])).toEqual([
    ['first', 'first'],
    ['second', 'second'],
    ['third', 'third'],
  ]);
});

it('runs exclusive work only after every active task finishes', async () => {
  const shared = deferred<void>();
  const started: string[] = [];
  const run = runBoundedTasks(
    [
      {
        id: 'shared',
        cpuTokens: 1,
        memoryMiB: 512,
        run: () => {
          started.push('shared');
          return shared.promise;
        },
      },
      {
        id: 'build',
        cpuTokens: 4,
        memoryMiB: 4096,
        exclusive: true,
        run: () => {
          started.push('build');
          return 'built';
        },
      },
    ],
    { profile }
  );

  await vi.waitFor(() => expect(started).toEqual(['shared']));
  shared.resolve();
  await run;
  expect(started).toEqual(['shared', 'build']);
});

it('rejects duplicate ids and tasks larger than the selected profile', async () => {
  await expect(
    runBoundedTasks(
      [
        { id: 'same', cpuTokens: 1, memoryMiB: 1, run: () => null },
        { id: 'same', cpuTokens: 1, memoryMiB: 1, run: () => null },
      ],
      { profile }
    )
  ).rejects.toThrow(/Duplicate/u);

  await expect(
    runBoundedTasks([{ id: 'huge', cpuTokens: 5, memoryMiB: 1, run: () => null }], {
      profile,
    })
  ).rejects.toThrow(/profile allows/u);
});

it('aborts active peers and never launches pending work after a lane rejection', async () => {
  const started: string[] = [];
  const events: Array<{ activityId: string; state: string }> = [];
  let peerAborted = false;
  const run = runBoundedTasks(
    [
      {
        id: 'failed',
        cpuTokens: 2,
        memoryMiB: 1024,
        run: () => {
          started.push('failed');
          throw new Error('lane failed');
        },
      },
      {
        id: 'peer',
        cpuTokens: 2,
        memoryMiB: 1024,
        run: ({ signal }: { signal: AbortSignal }) =>
          new Promise((_, reject) => {
            started.push('peer');
            signal.addEventListener(
              'abort',
              () => {
                peerAborted = true;
                reject(signal.reason);
              },
              { once: true }
            );
          }),
      },
      {
        id: 'pending',
        cpuTokens: 1,
        memoryMiB: 1024,
        run: () => {
          started.push('pending');
        },
      },
    ],
    { onTransition: (event) => events.push(event), profile, schedulerId: 'failure' }
  );

  await expect(run).rejects.toThrow('lane failed');
  expect(peerAborted).toBe(true);
  expect(started).toEqual(['failed', 'peer']);
  expect(events).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ activityId: 'failure.lane.failed', state: 'failed' }),
      expect.objectContaining({ activityId: 'failure.lane.peer', state: 'interrupted' }),
      expect.objectContaining({ activityId: 'failure.lane.pending', state: 'skipped' }),
    ])
  );
});

it('records overlapping real intervals and resource wait transitions', async () => {
  let now = Date.parse('2026-08-23T10:00:00.000Z');
  const first = deferred<string>();
  const second = deferred<string>();
  const events: Array<{
    activityId: string;
    state: string;
    at: string;
    waitReasons?: string[];
    waitDurations?: { resourceTokensMs: number };
    executionProfile?: {
      checkerCount: number;
      cpuTokens: number;
      toolName: string;
      toolVersion: string;
      workers: number;
    };
  }> = [];
  const run = runBoundedTasks(
    [
      {
        id: 'first',
        cpuTokens: 2,
        memoryMiB: 1024,
        workers: 7,
        executionProfile: {
          checkerCount: 2,
          toolName: 'typescript',
          toolVersion: '7.0.2',
        },
        run: () => first.promise,
      },
      {
        id: 'parallel',
        cpuTokens: 2,
        memoryMiB: 1024,
        run: () => second.promise,
      },
      {
        id: 'resource-wait',
        cpuTokens: 1,
        memoryMiB: 512,
        run: () => 'third',
      },
    ],
    {
      now: () => now,
      onTransition: (event) => events.push(event),
      profile,
      schedulerId: 'deterministic',
    }
  );

  await vi.waitFor(() => {
    expect(events.filter(({ state }) => state === 'started')).toHaveLength(3);
  });
  now += 100;
  first.resolve('first');
  await vi.waitFor(() =>
    expect(events).toContainEqual(
      expect.objectContaining({
        activityId: 'deterministic.lane.resource-wait',
        state: 'started',
        waitReasons: ['resource-tokens'],
      })
    )
  );
  now += 100;
  second.resolve('parallel');
  await run;

  const firstStarted = events.find(
    ({ activityId, state }) => activityId === 'deterministic.lane.first' && state === 'started'
  );
  const parallelStarted = events.find(
    ({ activityId, state }) => activityId === 'deterministic.lane.parallel' && state === 'started'
  );
  const firstFinished = events.find(
    ({ activityId, state }) => activityId === 'deterministic.lane.first' && state === 'completed'
  );
  expect(Date.parse(firstStarted!.at)).toBeLessThan(Date.parse(firstFinished!.at));
  expect(Date.parse(parallelStarted!.at)).toBeLessThan(Date.parse(firstFinished!.at));
  const resourceStarted = events.find(
    ({ activityId, state }) =>
      activityId === 'deterministic.lane.resource-wait' && state === 'started'
  );
  const firstQueued = events.find(
    ({ activityId, state }) => activityId === 'deterministic.lane.first' && state === 'queued'
  );
  expect(resourceStarted?.waitDurations?.resourceTokensMs).toBe(100);
  expect(firstQueued?.executionProfile).toMatchObject({
    checkerCount: 2,
    cpuTokens: 2,
    toolName: 'typescript',
    toolVersion: '7.0.2',
    workers: 7,
  });
});

it('normalizes camel-case task ids into stable timeline lane ids', async () => {
  const events: Array<{ activityId: string; state: string }> = [];

  await runBoundedTasks([{ id: 'targetPaths', cpuTokens: 1, memoryMiB: 128, run: () => 'ok' }], {
    onTransition: (event) => events.push(event),
    profile,
    schedulerId: 'normalized',
  });

  expect(events).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ activityId: 'normalized.lane.target-paths', state: 'queued' }),
      expect.objectContaining({ activityId: 'normalized.lane.target-paths', state: 'completed' }),
    ])
  );
});

it('rejects task ids that collide after timeline normalization', async () => {
  await expect(
    runBoundedTasks(
      [
        { id: 'targetPaths', cpuTokens: 1, memoryMiB: 128, run: () => 'first' },
        { id: 'target-paths', cpuTokens: 1, memoryMiB: 128, run: () => 'second' },
      ],
      { profile, schedulerId: 'collision' }
    )
  ).rejects.toThrow('collide after timeline normalization');
});
