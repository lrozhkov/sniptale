import { expect, it, vi } from 'vitest';
import { PageRecoveryStorage, PAGE_RECOVERY_STORAGE_KEY } from '.';
import { PAGE_RECOVERY_TTL_MS } from '../../../contracts/page-recovery';

const first = 'e9e02b06-6761-4c7a-88fe-15385b82b25b';
const second = 'cf53bdda-bec6-42d9-a9c9-4e478c5f0535';
const url = 'https://example.test/page';
function fixture() {
  let saved: Record<string, unknown> = {};
  let time = 1000;
  let claims: Record<string, unknown> = {};
  const sessionArea = {
    get: async () => structuredClone(claims),
    set: async (items: Record<string, unknown>) => {
      claims = structuredClone(items);
    },
    remove: async () => {
      claims = {};
    },
  };
  const area = {
    get: vi.fn(async () => structuredClone(saved)),
    set: vi.fn(async (items: Record<string, unknown>) => {
      saved = structuredClone(items);
    }),
    remove: vi.fn(async () => {
      saved = {};
    }),
  };
  return {
    area,
    sessionArea,
    loseSession: () => {
      claims = {};
    },
    storage: new PageRecoveryStorage(area, () => time, sessionArea),
    read: () => structuredClone(saved),
    setTime: (next: number) => {
      time = next;
    },
  };
}
it('preserves disjoint records under parallel writes and opening does not write or extend TTL', async () => {
  const f = fixture();
  await Promise.all([f.storage.save(first, url, 'first'), f.storage.save(second, url, 'second')]);
  const before = f.read();
  const writes = f.area.set.mock.calls.length;
  f.setTime(1000 + PAGE_RECOVERY_TTL_MS - 1);
  expect((await f.storage.read(first, url))?.payload).toBe('first');
  expect((await f.storage.read(second, url))?.payload).toBe('second');
  expect(await f.storage.read(first, 'https://other.test')).toBeNull();
  expect(f.read()).toEqual(before);
  expect(f.area.set).toHaveBeenCalledTimes(writes);
  f.setTime(1000 + PAGE_RECOVERY_TTL_MS);
  expect(await f.storage.read(first, url)).toBeNull();
  await f.storage.sweep();
  expect(f.read()).toEqual({});
});
it('starts TTL again only after a new authored save and replaces the previous page set', async () => {
  const f = fixture();
  await f.storage.save(first, url, 'old');
  f.setTime(2000);
  await f.storage.save(first, `${url}/new`, 'new');
  f.setTime(1000 + PAGE_RECOVERY_TTL_MS);
  expect(await f.storage.read(first, url)).toBeNull();
  expect((await f.storage.read(first, `${url}/new`))?.payload).toBe('new');
});
it('preserves accepted bytes after write and delete failures and permits an explicit retry', async () => {
  const f = fixture();
  await f.storage.save(first, url, 'accepted');
  const prior = f.read();
  f.area.set.mockRejectedValueOnce(new Error('storage failed'));
  await expect(f.storage.save(first, url, 'failed')).rejects.toThrow('storage failed');
  expect(f.read()).toEqual(prior);
  f.area.remove.mockRejectedValueOnce(new Error('delete failed'));
  await expect(f.storage.discard(first)).rejects.toThrow('delete failed');
  expect((await f.storage.read(first, url))?.payload).toBe('accepted');
  await f.storage.discard(first);
  expect(await f.storage.read(first, url)).toBeNull();
  await f.storage.save(first, url, 'fresh');
  expect((await f.storage.read(first, url))?.payload).toBe('fresh');
});
it('holds the complete read-check-write until the storage acknowledgement', async () => {
  const f = fixture();
  let release!: () => void;
  let entered!: () => void;
  const active = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const original = f.area.set.getMockImplementation()!;
  f.area.set.mockImplementationOnce(async (items) => {
    entered();
    await gate;
    await original(items);
  });
  const write = f.storage.save(first, url, 'first');
  await active;
  const next = f.storage.save(second, url, 'second');
  expect(f.area.get).toHaveBeenCalledTimes(1);
  release();
  await Promise.all([write, next]);
  expect((await f.storage.read(first, url))?.payload).toBe('first');
  expect((await f.storage.read(second, url))?.payload).toBe('second');
});
it('refuses a malformed ledger without replacing or deleting its data', async () => {
  const f = fixture();
  await f.area.set({ [PAGE_RECOVERY_STORAGE_KEY]: { version: 2, entries: [] } });
  const prior = f.read();
  await expect(f.storage.save(first, url, 'new')).rejects.toThrow();
  expect(f.read()).toEqual(prior);
});

it('expires from the authored timestamp rather than a delayed storage acknowledgement', async () => {
  const f = fixture();
  f.setTime(2000);
  await f.storage.save(first, url, 'authored earlier', 1000);
  expect((await f.storage.read(first, url))?.changedAt).toBe(1000);
  f.setTime(1000 + PAGE_RECOVERY_TTL_MS);
  expect(await f.storage.read(first, url)).toBeNull();
});

it('refuses future expired or out-of-order timestamps without replacing accepted data', async () => {
  const f = fixture();
  f.setTime(2000);
  await f.storage.save(first, url, 'accepted', 2000);
  const prior = f.read();
  await expect(f.storage.save(first, url, 'future', 2001)).rejects.toThrow('stale');
  await expect(f.storage.save(first, url, 'older', 1000)).rejects.toThrow('stale');
  expect(f.read()).toEqual(prior);
  f.setTime(2000 + PAGE_RECOVERY_TTL_MS);
  await expect(f.storage.save(first, url, 'expired', 2000)).rejects.toThrow('stale');
  expect(f.read()).toEqual(prior);
});

it('keeps the same native tab nonce across reload and worker restart while rotating producer leases', async () => {
  const f = fixture();
  const firstClaim = await f.storage.bindTab(1, 'document-one');
  await f.storage.save(firstClaim.nonce, url, 'original');
  const worker = new PageRecoveryStorage(f.area, () => 1000, f.sessionArea);
  const reload = await worker.bindTab(1, 'document-two');
  expect(reload.nonce).toBe(firstClaim.nonce);
  expect(reload.lease).not.toBe(firstClaim.lease);
  expect((await worker.read(reload.nonce, url))?.payload).toBe('original');
  const duplicate = await worker.bindTab(2, 'duplicate');
  expect(duplicate.nonce).not.toBe(firstClaim.nonce);
  expect(await worker.read(duplicate.nonce, url)).toBeNull();
});
it('refuses old payload after browser restart, including a lone first claimant', async () => {
  const f = fixture();
  const original = await f.storage.bindTab(1, 'original');
  await f.storage.save(original.nonce, url, 'retained');
  const before = f.read();
  f.loseSession();
  const restarted = new PageRecoveryStorage(f.area, () => 1000, f.sessionArea);
  const firstClaim = await restarted.bindTab(1, 'restored-first');
  expect(firstClaim.nonce).not.toBe(original.nonce);
  expect(await restarted.read(firstClaim.nonce, url)).toBeNull();
  expect(f.read()).toEqual(before);
  const secondClaim = await restarted.bindTab(2, 'restored-second');
  expect(await restarted.read(secondClaim.nonce, url)).toBeNull();
  expect(f.read()).toEqual(before);
});
