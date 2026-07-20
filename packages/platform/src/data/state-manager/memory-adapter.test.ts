import { describe, expect, it } from 'vitest';
import { createMemoryStateDomainAdapter } from './memory-adapter';

describe('memory state domain adapter', () => {
  it('reads, writes, removes, and hydrates entries', async () => {
    const adapter = createMemoryStateDomainAdapter([['first', 1]]);

    await adapter.write('second', 2);
    await expect(adapter.read?.('first')).resolves.toBe(1);
    await expect(adapter.hydrate?.()).resolves.toEqual({ first: 1, second: 2 });

    await adapter.removeMany?.(['first', 'second']);
    await expect(adapter.hydrate?.()).resolves.toEqual({});
  });

  it('clears all entries', async () => {
    const adapter = createMemoryStateDomainAdapter([['first', 1]]);

    await adapter.clear?.();

    await expect(adapter.hydrate?.()).resolves.toEqual({});
  });
});
