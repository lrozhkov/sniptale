import { expect, it, vi } from 'vitest';
import { PageRecoveryController } from './controller';
import type { PageRecoveryReply, PageRecoveryRequest } from '../../../contracts/page-recovery';
const lease = 'cf53bdda-bec6-42d9-a9c9-4e478c5f0535';
const fresh = 'e9e02b06-6761-4c7a-88fe-15385b82b25b';
function gate<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}
function fixture() {
  let capture: unknown | null = null;
  const request = vi.fn(async (message: PageRecoveryRequest): Promise<PageRecoveryReply> => ({
    kind: 'result',
    requestId: message.requestId,
    status: 'ready',
    lease: message.kind === 'discard' ? fresh : lease,
    available: true,
    ...(message.kind === 'load' ? { payload: '{"version":1}' } : {}),
  }));
  const apply = vi.fn(() => true);
  const controller = new PageRecoveryController({ request, capture: () => capture, apply });
  return {
    controller,
    request,
    apply,
    change: (value: unknown) => {
      capture = value;
    },
  };
}
it('opens without a write and restores only after an explicit command without extending TTL', async () => {
  const f = fixture();
  await f.controller.open();
  expect(f.request.mock.calls.map(([message]) => message.kind)).toEqual(['peek']);
  expect(f.controller.getSnapshot().available).toBe(true);
  expect(await f.controller.restore()).toBe(true);
  expect(f.apply).toHaveBeenCalledWith({ version: 1 });
  expect(f.request.mock.calls.map(([message]) => message.kind)).toEqual(['peek', 'load']);
  expect(f.controller.getSnapshot().available).toBe(false);
});
it('saves changes that arrive while opening and replaces the old set without loading it', async () => {
  const f = fixture();
  const opening = gate<PageRecoveryReply>();
  const entered = gate<void>();
  f.request.mockImplementationOnce(async () => {
    entered.resolve();
    return opening.promise;
  });
  const open = f.controller.open();
  await entered.promise;
  f.change({ text: 'new' });
  const save = f.controller.changed();
  opening.resolve({
    kind: 'result',
    requestId: crypto.randomUUID(),
    status: 'ready',
    lease,
    available: true,
  });
  await Promise.all([open, save]);
  expect(f.request.mock.calls.map(([message]) => message.kind)).toEqual(['peek', 'save']);
  expect(f.request.mock.calls[1]![0]).toMatchObject({ payload: '{"text":"new"}' });
  expect(f.controller.getSnapshot().available).toBe(false);
});
it('drains an admitted save and fences queued producers before Reset or Close', async () => {
  const f = fixture();
  await f.controller.open();
  const active = gate<PageRecoveryReply>();
  const entered = gate<void>();
  f.request.mockImplementationOnce(async () => {
    entered.resolve();
    return active.promise;
  });
  f.change({ text: 'one' });
  const save = f.controller.changed();
  await entered.promise;
  f.change({ text: 'two' });
  const queued = f.controller.changed();
  const action = vi.fn();
  const discard = f.controller.discard(action);
  expect(action).not.toHaveBeenCalled();
  active.resolve({
    kind: 'result',
    requestId: crypto.randomUUID(),
    status: 'ready',
    lease,
    available: false,
  });
  await Promise.all([save, queued, discard]);
  expect(f.request.mock.calls.map(([message]) => message.kind)).toEqual([
    'peek',
    'save',
    'discard',
  ]);
  expect(action).toHaveBeenCalledTimes(1);
  f.change({ text: 'new session' });
  await f.controller.changed();
  expect(f.request.mock.calls.at(-1)![0]).toMatchObject({
    kind: 'save',
    lease: fresh,
    payload: '{"text":"new session"}',
  });
});
it('preserves live edits after deletion refusal and allows an explicit retry', async () => {
  const f = fixture();
  await f.controller.open();
  const action = vi.fn();
  f.request.mockRejectedValueOnce(new Error('delete failed'));
  expect(await f.controller.discard(action)).toBe(false);
  expect(action).not.toHaveBeenCalled();
  expect(f.controller.getSnapshot().error).toBe(true);
  expect(await f.controller.discard(action)).toBe(true);
  expect(action).toHaveBeenCalledTimes(1);
});
it('retains a failed save for retry and does not merge it with the recoverable source', async () => {
  const f = fixture();
  await f.controller.open();
  f.request.mockRejectedValueOnce(new Error('save failed'));
  f.change({ text: 'new' });
  expect(await f.controller.changed()).toBe(false);
  expect(await f.controller.retry()).toBe(true);
  expect(f.request.mock.calls.map(([message]) => message.kind)).toEqual(['peek', 'save', 'save']);
  expect(f.controller.getSnapshot().error).toBe(false);
});
it('refuses a stale Restore reply after a newer user change', async () => {
  const f = fixture();
  await f.controller.open();
  const load = gate<PageRecoveryReply>();
  const entered = gate<void>();
  f.request.mockImplementationOnce(async () => {
    entered.resolve();
    return load.promise;
  });
  const restore = f.controller.restore();
  await entered.promise;
  f.change({ text: 'new' });
  const save = f.controller.changed();
  load.resolve({
    kind: 'result',
    requestId: crypto.randomUUID(),
    status: 'ready',
    lease,
    available: true,
    payload: '{"old":true}',
  });
  expect(await restore).toBe(false);
  await save;
  expect(f.apply).not.toHaveBeenCalled();
  expect(f.request.mock.calls.at(-1)![0]).toMatchObject({
    kind: 'save',
    payload: '{"text":"new"}',
  });
});
it('retains the source after apply refusal and permits retry without saving partial state', async () => {
  const f = fixture();
  await f.controller.open();
  f.apply.mockReturnValueOnce(false);
  expect(await f.controller.restore()).toBe(false);
  expect(f.controller.getSnapshot()).toMatchObject({ available: true, error: true });
  expect(await f.controller.restore()).toBe(true);
  expect(f.request.mock.calls.map(([message]) => message.kind)).toEqual(['peek', 'load', 'load']);
});
it('cancels queued producers and late opening replies after disposal', async () => {
  const f = fixture();
  const opening = gate<PageRecoveryReply>();
  const entered = gate<void>();
  f.request.mockImplementationOnce(async () => {
    entered.resolve();
    return opening.promise;
  });
  const open = f.controller.open();
  await entered.promise;
  f.change({ text: 'new' });
  const save = f.controller.changed();
  f.controller.dispose();
  opening.resolve({
    kind: 'result',
    requestId: crypto.randomUUID(),
    status: 'ready',
    lease,
    available: true,
  });
  expect(await open).toBe(false);
  expect(await save).toBe(false);
  expect(f.request).toHaveBeenCalledTimes(1);
});

it('retains the user-change timestamp across a failed save and delayed retry', async () => {
  const clock = vi.spyOn(Date, 'now').mockReturnValue(1000);
  try {
    const f = fixture();
    await f.controller.open();
    f.request.mockRejectedValueOnce(new Error('save failed'));
    f.change({ text: 'new' });
    await f.controller.changed();
    clock.mockReturnValue(2000);
    await f.controller.retry();
    expect(f.request.mock.calls.at(-1)![0]).toMatchObject({ kind: 'save', changedAt: 1000 });
  } finally {
    clock.mockRestore();
  }
});
it('reports successful opening without needing an authored save', async () => {
  const f = fixture();
  expect(await f.controller.open()).toBe(true);
});
it('keeps a newer capture error visible after an older admitted write completes', async () => {
  const f = fixture();
  await f.controller.open();
  const active = gate<PageRecoveryReply>();
  const entered = gate<void>();
  f.request.mockImplementationOnce(async () => {
    entered.resolve();
    return active.promise;
  });
  f.change({ text: 'one' });
  const firstSave = f.controller.changed();
  await entered.promise;
  const cyclic: Record<string, unknown> = {};
  cyclic['self'] = cyclic;
  f.change(cyclic);
  expect(await f.controller.changed()).toBe(false);
  active.resolve({
    kind: 'result',
    requestId: crypto.randomUUID(),
    status: 'ready',
    lease,
    available: false,
  });
  await firstSave;
  expect(f.controller.getSnapshot().error).toBe(true);
  expect(f.request).toHaveBeenCalledTimes(2);
});

it('retries a refused capture with its original change timestamp', async () => {
  const clock = vi.spyOn(Date, 'now').mockReturnValue(1000);
  try {
    const f = fixture();
    await f.controller.open();
    const cyclic: Record<string, unknown> = {};
    cyclic['self'] = cyclic;
    f.change(cyclic);
    expect(await f.controller.changed()).toBe(false);
    clock.mockReturnValue(2000);
    f.change({ text: 'valid after finalization' });
    expect(await f.controller.retry()).toBe(true);
    expect(f.request.mock.calls.at(-1)![0]).toMatchObject({ kind: 'save', changedAt: 1000 });
    expect(f.controller.getSnapshot().error).toBe(false);
  } finally {
    clock.mockRestore();
  }
});

it('does not replay captured data after disconnect and admits only a new user change', async () => {
  const f = fixture();
  await f.controller.open();
  f.controller.unavailable();
  expect(f.controller.getSnapshot().available).toBe(false);
  expect(await f.controller.retry()).toBe(true);
  expect(f.request.mock.calls.map(([message]) => message.kind)).toEqual(['peek', 'peek']);
  f.change({ text: 'new user change' });
  await f.controller.changed();
  expect(f.request.mock.calls.at(-1)![0]).toMatchObject({
    kind: 'save',
    payload: '{"text":"new user change"}',
  });
});

it('posts the latest admitted pagehide version without waiting for an older write reply', async () => {
  const f = fixture();
  await f.controller.open();
  const active = gate<PageRecoveryReply>();
  const entered = gate<void>();
  f.request.mockImplementationOnce(async () => {
    entered.resolve();
    return active.promise;
  });
  f.change({ text: 'old' });
  const old = f.controller.changed();
  await entered.promise;
  f.change({ text: 'last edit' });
  const queued = f.controller.changed();
  const flush = f.controller.flushBeforeNavigation();
  expect(f.request.mock.calls.at(-1)![0]).toMatchObject({
    kind: 'save-final',
    payload: '{"text":"last edit"}',
  });
  active.resolve({
    kind: 'result',
    requestId: crypto.randomUUID(),
    status: 'ready',
    lease,
    available: false,
  });
  await Promise.all([old, queued, flush]);
});
