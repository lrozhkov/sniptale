import { describe, expect, it } from 'vitest';

import { createNativeTransferQueue } from './transfer-queue';

function deferred<TValue>() {
  let resolve!: (value: TValue) => void;
  const promise = new Promise<TValue>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe('native transfer queue', () => {
  it('serializes work for the same transfer and allows independent transfers', async () => {
    const queue = createNativeTransferQueue();
    const first = deferred<string>();
    const events: string[] = [];

    const firstResult = queue.run('capture-1', async () => {
      events.push('first-start');
      return first.promise;
    });
    const secondResult = queue.run('capture-1', async () => {
      events.push('second-start');
      return 'second';
    });
    const independentResult = queue.run('capture-2', async () => {
      events.push('independent-start');
      return 'independent';
    });

    await expect(independentResult).resolves.toBe('independent');
    expect(events).toEqual(['first-start', 'independent-start']);

    first.resolve('first');
    await expect(firstResult).resolves.toBe('first');
    await expect(secondResult).resolves.toBe('second');
    expect(events).toEqual(['first-start', 'independent-start', 'second-start']);
  });
});
