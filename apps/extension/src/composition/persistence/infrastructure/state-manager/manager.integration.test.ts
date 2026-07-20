import { describe, expect, it } from 'vitest';
import { createStateManager } from '@sniptale/platform/data/state-manager';
import { createMemoryStateDomainAdapter } from '@sniptale/platform/data/state-manager/memory-adapter';

describe('state manager domain registration', () => {
  it('registers domains and hydrates adapter state', async () => {
    const manager = createStateManager();
    manager.registerDomain('memory.demo', {
      adapter: createMemoryStateDomainAdapter([['demo', 1]]),
    });

    await expect(manager.read('memory.demo', 'demo')).resolves.toBe(1);
    await expect(manager.hydrate('memory.demo')).resolves.toEqual({ demo: 1 });
  });
});

describe('state manager revisions', () => {
  it('rejects stale revision writes', async () => {
    const manager = createStateManager();
    manager.registerDomain('memory.revisions', {
      adapter: createMemoryStateDomainAdapter(),
    });

    const first = await manager.write('memory.revisions', 'item', 'first');
    await manager.write('memory.revisions', 'item', 'second', { revision: first.revision });

    await expect(
      manager.write('memory.revisions', 'item', 'stale', { revision: first.revision })
    ).rejects.toThrow('StateManager stale revision');
  });
});

describe('state manager mutation queue', () => {
  it('serializes concurrent mutations for the same domain key', async () => {
    const manager = createStateManager();
    manager.registerDomain('memory.queue', {
      adapter: createMemoryStateDomainAdapter([['count', 0]]),
    });

    await Promise.all([
      manager.mutate<number>('memory.queue', 'count', (value) => (value ?? 0) + 1),
      manager.mutate<number>('memory.queue', 'count', (value) => (value ?? 0) + 1),
    ]);

    await expect(manager.read('memory.queue', 'count')).resolves.toBe(2);
  });
});

describe('state manager removal and batch operations', () => {
  it('removes keys and clears domains through the adapter', async () => {
    const manager = createStateManager();
    manager.registerDomain('memory.clear', {
      adapter: createMemoryStateDomainAdapter([
        ['first', 1],
        ['second', 2],
      ]),
    });

    await manager.remove('memory.clear', 'first');
    await expect(manager.hydrate('memory.clear')).resolves.toEqual({ second: 2 });
    await manager.clearDomain('memory.clear');
    await expect(manager.hydrate('memory.clear')).resolves.toEqual({});
  });

  it('writes and removes batches while updating key revisions', async () => {
    const manager = createStateManager();
    manager.registerDomain('memory.batch', {
      adapter: createMemoryStateDomainAdapter(),
    });

    await manager.writeMany('memory.batch', { first: 1, second: 2 });
    const first = await manager.readSnapshot('memory.batch', 'first');
    expect(first).toEqual({ revision: 1, value: 1 });

    await manager.removeMany('memory.batch', ['first', 'second']);

    await expect(manager.write('memory.batch', 'first', 3, { revision: 0 })).rejects.toThrow(
      'StateManager stale revision'
    );
    await expect(manager.hydrate('memory.batch')).resolves.toEqual({});
  });
});
