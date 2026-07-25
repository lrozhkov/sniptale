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
    { profile }
  );

  await expect(run).rejects.toThrow('lane failed');
  expect(peerAborted).toBe(true);
  expect(started).toEqual(['failed', 'peer']);
});
