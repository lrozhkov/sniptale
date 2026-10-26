import { expect, it, vi } from 'vitest';
import { PageRecoveryService } from './service';
import { PageRecoveryStorage } from '../storage/page-recovery';
import type { PageRecoveryRequest } from '../../contracts/page-recovery';
const url = 'https://example.test/page';
function area() {
  let data: Record<string, unknown> = {};
  return {
    get: vi.fn(async () => structuredClone(data)),
    set: vi.fn(async (next: Record<string, unknown>) => {
      data = structuredClone(next);
    }),
    remove: vi.fn(async () => {
      data = {};
    }),
    clear: () => {
      data = {};
    },
    read: () => structuredClone(data),
  };
}
function fixture() {
  const local = area();
  const session = area();
  const storage = new PageRecoveryStorage(local, () => 1000, session);
  const service = new PageRecoveryService(storage);
  const connect = (tabId = 1, documentId = 'document-one') =>
    service.connect({ tabId, documentId, pageUrl: url });
  return { local, session, storage, service, connect };
}
function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
const peek = () => ({ kind: 'peek' as const, requestId: crypto.randomUUID() });
const save = (
  lease: string,
  payload: string
): Extract<PageRecoveryRequest, { payload: string }> => ({
  kind: 'save',
  requestId: crypto.randomUUID(),
  lease,
  payload,
  changedAt: 1000,
});
const discard = (lease: string): PageRecoveryRequest => ({
  kind: 'discard',
  requestId: crypto.randomUUID(),
  lease,
});
it('serializes parallel writers and refuses a superseded document lease', async () => {
  const f = fixture();
  const first = f.connect();
  const second = f.connect(2);
  const a = await first.request(peek());
  const b = await second.request(peek());
  const results = await Promise.all([
    first.request(save(a.lease!, 'first')),
    second.request(save(b.lease!, 'second')),
  ]);
  expect(results.map((reply) => reply.status)).toEqual(['ready', 'ready']);
  const one = await f.storage.getClaim(1);
  const two = await f.storage.getClaim(2);
  expect((await f.storage.read(one!.nonce, url))?.payload).toBe('first');
  expect((await f.storage.read(two!.nonce, url))?.payload).toBe('second');
  f.service.navigate(1, 'document-two');
  expect((await first.request(save(a.lease!, 'stale'))).status).toBe('refused');
  const reload = f.connect(1, 'document-two');
  expect(await reload.request(peek())).toMatchObject({ status: 'ready', available: true });
});
it('drains admitted writes before discard and refuses a delayed producer', async () => {
  const f = fixture();
  const connection = f.connect();
  const opened = await connection.request(peek());
  const entered = gate();
  const finish = gate();
  const original = f.local.set.getMockImplementation()!;
  f.local.set.mockImplementationOnce(async (data) => {
    entered.release();
    await finish.promise;
    await original(data);
  });
  const write = connection.request(save(opened.lease!, 'accepted'));
  await entered.promise;
  const reset = connection.request(discard(opened.lease!));
  const delayed = connection.request(save(opened.lease!, 'resurrection'));
  expect(f.local.remove).not.toHaveBeenCalled();
  finish.release();
  const replies = await Promise.all([write, reset, delayed]);
  expect(replies.map((reply) => reply.status)).toEqual(['ready', 'ready', 'refused']);
  expect(replies[1]!.lease).not.toBe(opened.lease);
  const claim = await f.storage.getClaim(1);
  expect(await f.storage.read(claim!.nonce, url)).toBeNull();
});
it('recreates a tab editing set with a fresh lease after discard', async () => {
  const f = fixture();
  const connection = f.connect();
  const opened = await connection.request(peek());
  await connection.request(save(opened.lease!, 'old'));
  const cleared = await connection.request(discard(opened.lease!));
  expect((await connection.request(save(opened.lease!, 'late'))).status).toBe('refused');
  expect((await connection.request(save(cleared.lease!, 'new'))).status).toBe('ready');
  const loaded = await connection.request({
    kind: 'load',
    requestId: crypto.randomUUID(),
    lease: cleared.lease!,
  });
  expect(loaded.payload).toBe('new');
});
it('preserves accepted bytes after failed save or discard and permits retry', async () => {
  const f = fixture();
  const connection = f.connect();
  const opened = await connection.request(peek());
  await connection.request(save(opened.lease!, 'accepted'));
  f.local.set.mockRejectedValueOnce(new Error('write failed'));
  expect((await connection.request(save(opened.lease!, 'failed'))).status).toBe('failed');
  const load = () =>
    connection.request({ kind: 'load', requestId: crypto.randomUUID(), lease: opened.lease! });
  expect((await load()).payload).toBe('accepted');
  expect((await connection.request(save(opened.lease!, 'retry'))).status).toBe('ready');
  f.local.remove.mockRejectedValueOnce(new Error('delete failed'));
  expect((await connection.request(discard(opened.lease!))).status).toBe('failed');
  expect((await load()).payload).toBe('retry');
  expect((await connection.request(discard(opened.lease!))).status).toBe('ready');
});
it('opens without replacing a recoverable set', async () => {
  const f = fixture();
  const first = f.connect();
  const opened = await first.request(peek());
  await first.request(save(opened.lease!, 'accepted'));
  first.disconnect();
  const before = f.local.read();
  const reload = f.connect(1, 'reloaded');
  expect(await reload.request(peek())).toMatchObject({ status: 'ready', available: true });
  expect(f.local.read()).toEqual(before);
});
it('refuses every old-payload claimant after browser restart while worker restart retains ownership', async () => {
  const f = fixture();
  const original = f.connect();
  const opened = await original.request(peek());
  await original.request(save(opened.lease!, 'accepted'));
  original.disconnect();
  const worker = new PageRecoveryService(new PageRecoveryStorage(f.local, () => 1000, f.session));
  const reload = worker.connect({ tabId: 1, documentId: 'worker-reconnected', pageUrl: url });
  expect((await reload.request(peek())).available).toBe(true);
  reload.disconnect();
  const before = f.local.read();
  f.session.clear();
  const browser = new PageRecoveryService(new PageRecoveryStorage(f.local, () => 1000, f.session));
  const first = browser.connect({ tabId: 1, documentId: 'first-claimant', pageUrl: url });
  expect((await first.request(peek())).available).toBe(false);
  const duplicate = browser.connect({ tabId: 2, documentId: 'duplicate', pageUrl: url });
  expect((await duplicate.request(peek())).available).toBe(false);
  expect(f.local.read()).toEqual(before);
});
it('excludes opening and delayed producers during local-data erasure', async () => {
  const f = fixture();
  const connection = f.connect();
  const opened = await connection.request(peek());
  const entered = gate();
  const finish = gate();
  const original = f.local.set.getMockImplementation()!;
  f.local.set.mockImplementationOnce(async (data) => {
    entered.release();
    await finish.promise;
    await original(data);
  });
  const write = connection.request(save(opened.lease!, 'accepted'));
  await entered.promise;
  const exclusion = f.service.reserveErasureExclusion();
  const late = connection.request(save(opened.lease!, 'late'));
  const opening = f.connect(2).request(peek());
  const drain = exclusion.waitForActiveMutations();
  finish.release();
  await write;
  await drain;
  expect((await late).status).toBe('refused');
  expect((await opening).status).toBe('refused');
  expect(await f.service.cleanup()).toEqual([
    {
      id: 'page-recovery-runtime-state',
      remainingCount: 0,
      severity: 'required',
      status: 'verified-empty',
    },
  ]);
  f.local.clear();
  f.session.clear();
  exclusion.release();
  expect((await connection.request(save(opened.lease!, 'resurrection'))).status).toBe('refused');
  expect(f.local.read()).toEqual({});
});

it('admits a terminal snapshot before disconnect and retains it after an earlier write completes', async () => {
  const f = fixture();
  const connection = f.connect();
  const opened = await connection.request(peek());
  const entered = gate();
  const finish = gate();
  const original = f.local.set.getMockImplementation()!;
  f.local.set.mockImplementationOnce(async (data) => {
    entered.release();
    await finish.promise;
    await original(data);
  });
  const older = connection.request(save(opened.lease!, 'old'));
  await entered.promise;
  const terminal = connection.request({ ...save(opened.lease!, 'last edit'), kind: 'save-final' });
  connection.disconnect();
  finish.release();
  await Promise.all([older, terminal]);
  const claim = await f.storage.getClaim(1);
  expect((await f.storage.read(claim!.nonce, url))?.payload).toBe('last edit');
  expect(
    (await connection.request({ ...save(opened.lease!, 'too late'), kind: 'save-final' })).status
  ).toBe('refused');
});
