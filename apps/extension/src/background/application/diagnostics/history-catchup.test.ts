import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  enrollment: vi.fn(),
  state: vi.fn(),
  page: vi.fn(),
  save: vi.fn(),
  deliver: vi.fn(),
  get: vi.fn(),
  create: vi.fn(),
  clear: vi.fn(),
  add: vi.fn(),
  remove: vi.fn(),
  warn: vi.fn(),
}));
vi.mock('../../../composition/persistence/sync-capture/queue-history-scan', () => ({
  loadSyncQueueHistoryEnrollment: mocks.enrollment,
  loadSyncQueueHistoryScanState: mocks.state,
  loadSyncQueueHistoryScanPage: mocks.page,
  saveSyncQueueHistoryScanState: mocks.save,
}));
vi.mock('../../../workflows/sync-transfer/queue-history', () => ({
  deliverSyncQueueHistory: mocks.deliver,
}));
vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({ warn: mocks.warn }),
}));
import { registerQueueHistoryCatchup } from './history-catchup';
const alarmName = 'sniptale:sync-queue-history';
const scope = { spaceId: 'space', connectionGeneration: 1, profileCreatedAt: 1 };
const state = { scope, revision: 3, afterKey: 'saved-position' };
const operation = { kind: 'operation', operationId: 'operation' };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('chrome', {
    alarms: {
      get: mocks.get,
      create: mocks.create,
      clear: mocks.clear,
      onAlarm: { addListener: mocks.add, removeListener: mocks.remove },
    },
  });
  mocks.get.mockResolvedValue({ name: alarmName, periodInMinutes: 1 });
  mocks.enrollment.mockResolvedValue(scope);
  mocks.state.mockResolvedValue(state);
  mocks.page.mockResolvedValue({
    sources: [operation],
    nextAfterKey: null,
    more: false,
    invalidSources: 0,
  });
  mocks.deliver.mockResolvedValue(true);
  mocks.save.mockImplementation(async (previous, afterKey) => ({
    ...previous,
    afterKey,
    revision: previous.revision + 1,
  }));
});
afterEach(() => vi.unstubAllGlobals());
it('resumes persisted progress and attempts connection before pending operation streams', async () => {
  const owner = registerQueueHistoryCatchup();
  expect(mocks.get).not.toHaveBeenCalled();
  await owner.run();
  expect(mocks.create).not.toHaveBeenCalled();
  expect(mocks.deliver.mock.calls).toEqual([
    [scope, { kind: 'connection' }],
    [scope, operation],
  ]);
  expect(mocks.page).toHaveBeenCalledWith(state, 64);
  expect(mocks.save).toHaveBeenCalledWith(state, null);
  owner.dispose();
  expect(mocks.remove).toHaveBeenCalledWith(mocks.add.mock.calls[0]![0]);
  expect(mocks.clear).not.toHaveBeenCalled();
});
it.each([undefined, { periodInMinutes: 2 }])(
  'creates or repairs the retry alarm before enrollment reads: %j',
  async (alarm) => {
    mocks.get.mockResolvedValue(alarm);
    mocks.enrollment.mockRejectedValue(new Error('secret database detail'));
    const owner = registerQueueHistoryCatchup();
    await owner.run();
    expect(mocks.create).toHaveBeenCalledWith(alarmName, { periodInMinutes: 1 });
    expect(mocks.create.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.enrollment.mock.invocationCallOrder[0]!
    );
    expect(mocks.clear).not.toHaveBeenCalled();
    expect(mocks.warn).toHaveBeenCalledWith('Sync queue history catch-up deferred');
    owner.dispose();
  }
);
it('clears only its own alarm when enrollment is absent', async () => {
  mocks.enrollment.mockResolvedValue(null);
  const owner = registerQueueHistoryCatchup();
  await owner.run();
  expect(mocks.clear).toHaveBeenCalledWith(alarmName);
  expect(mocks.state).not.toHaveBeenCalled();
  expect(mocks.deliver).not.toHaveBeenCalled();
  owner.dispose();
});
it('uses a two-page budget and resumes the committed position on the next run', async () => {
  mocks.page.mockResolvedValue({
    sources: [],
    nextAfterKey: 'next',
    more: true,
    invalidSources: 0,
  });
  const owner = registerQueueHistoryCatchup();
  await owner.run();
  expect(mocks.page.mock.calls).toEqual([
    [state, 64],
    [{ ...state, revision: 4, afterKey: 'next' }, 64],
  ]);
  expect(mocks.save).toHaveBeenCalledTimes(2);
  mocks.state.mockResolvedValue({ ...state, revision: 5, afterKey: 'next' });
  await owner.run();
  expect(mocks.page.mock.calls[2]).toEqual([{ ...state, revision: 5, afterKey: 'next' }, 64]);
  owner.dispose();
});
it('continues independent streams after refused or rejected delivery and preserves invalid evidence', async () => {
  const other = { kind: 'operation', operationId: 'other' };
  mocks.page.mockResolvedValue({
    sources: [operation, other],
    nextAfterKey: null,
    more: false,
    invalidSources: 2,
  });
  mocks.deliver
    .mockRejectedValueOnce(new Error('connection secret'))
    .mockResolvedValueOnce(false)
    .mockResolvedValueOnce(true);
  const owner = registerQueueHistoryCatchup();
  await owner.run();
  expect(mocks.deliver).toHaveBeenCalledTimes(3);
  expect(mocks.save).toHaveBeenCalledWith(state, null);
  expect(mocks.warn.mock.calls).toEqual([['Sync queue history contains invalid source metadata']]);
  owner.dispose();
});
it('replays from durable progress after failed cursor persistence', async () => {
  mocks.save.mockRejectedValueOnce(new Error('failed save'));
  const owner = registerQueueHistoryCatchup();
  await owner.run();
  await owner.run();
  expect(mocks.page.mock.calls).toEqual([
    [state, 64],
    [state, 64],
  ]);
  expect(mocks.warn).toHaveBeenCalledOnce();
  owner.dispose();
});
it.each(['get', 'create', 'clear', 'state', 'page'] as const)(
  'contains %s failures and permits a later retry',
  async (failure) => {
    mocks.get.mockResolvedValue(undefined);
    if (failure === 'clear') mocks.enrollment.mockResolvedValue(null);
    mocks[failure].mockRejectedValueOnce(new Error('credential-bearing exception'));
    const owner = registerQueueHistoryCatchup();
    await owner.run();
    expect(mocks.warn.mock.calls).toEqual([['Sync queue history catch-up deferred']]);
    await owner.run();
    expect(mocks.get).toHaveBeenCalledTimes(2);
    owner.dispose();
  }
);
it('coalesces alarms with a running pass and ignores unrelated or malformed alarm values', async () => {
  const gate = deferred<unknown>();
  mocks.enrollment.mockReturnValue(gate.promise);
  const owner = registerQueueHistoryCatchup();
  const listener = mocks.add.mock.calls[0]![0];
  listener(null);
  listener({ name: 'other' });
  expect(mocks.get).not.toHaveBeenCalled();
  const first = owner.run();
  listener({ name: alarmName });
  expect(owner.run()).toBe(first);
  gate.resolve(scope);
  await first;
  expect(mocks.get).toHaveBeenCalledOnce();
  owner.dispose();
  listener({ name: alarmName });
  await owner.run();
  expect(mocks.get).toHaveBeenCalledOnce();
});
it('stops before creating an alarm when disposed during the alarm read', async () => {
  const gate = deferred<unknown>();
  mocks.get.mockReturnValue(gate.promise);
  const owner = registerQueueHistoryCatchup();
  const run = owner.run();
  owner.dispose();
  gate.resolve(undefined);
  await run;
  expect(mocks.create).not.toHaveBeenCalled();
  expect(mocks.enrollment).not.toHaveBeenCalled();
});
it('finishes admitted publication but starts no other source or progress write after disposal', async () => {
  const entered = deferred<void>();
  const release = deferred<boolean>();
  mocks.deliver.mockImplementation(async (_scope, source) => {
    if (source.kind === 'connection') return true;
    entered.resolve();
    return release.promise;
  });
  mocks.page.mockResolvedValue({
    sources: [operation, { kind: 'operation', operationId: 'later' }],
    nextAfterKey: null,
    more: false,
    invalidSources: 0,
  });
  const owner = registerQueueHistoryCatchup();
  const run = owner.run();
  await entered.promise;
  owner.dispose();
  release.resolve(true);
  await run;
  expect(mocks.deliver).toHaveBeenCalledTimes(2);
  expect(mocks.save).not.toHaveBeenCalled();
});
