import { beforeEach, expect, it, vi } from 'vitest';
import {
  ensureNativeEditingRootAvailable,
  ensureNativeBackupRootAvailable,
  runWithNativePublicationResources,
} from './editing-admission';
const io = vi.hoisted(() => ({
  needs: vi.fn(),
  touch: vi.fn(),
  ready: vi.fn(),
  start: vi.fn(),
  backup: vi.fn(),
  cancel: vi.fn(),
  wait: vi.fn(),
  client: vi.fn(),
  reading: false,
}));
vi.mock('../../composition/persistence/assets/resource-sessions', () => ({
  runWithAssetResourceRead: async (action: () => Promise<unknown>) => {
    io.reading = true;
    try {
      return await action();
    } finally {
      io.reading = false;
    }
  },
}));
vi.mock('./native-residency', () => ({
  isNativeEditingRootReady: io.ready,
  needsNativeEditingPreparation: io.needs,
}));
vi.mock('../../platform/runtime-messaging/sync-product-client', () => ({
  createSyncProductClient: io.client,
}));
vi.mock('./native-cache', () => ({ touchNativeCacheRoot: io.touch }));
const root = { rootKind: 'video-project' as const, rootId: 'project' };
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('__SNIPTALE_SECURITY_E2E__', true);
  io.reading = false;
  io.needs.mockResolvedValue(true);
  io.touch.mockResolvedValue(undefined);
  io.client.mockReturnValue({
    prepareNative: io.start,
    prepareNativeBackup: io.backup,
    cancel: io.cancel,
    waitForOperation: io.wait,
  });
  io.start.mockResolvedValue({ kind: 'accepted', requestId: 'request' });
  io.backup.mockResolvedValue({ kind: 'accepted', requestId: 'request' });
  io.cancel.mockResolvedValue({ kind: 'cancelled', outcome: 'refused' });
  io.wait.mockResolvedValue({ job: { state: 'ready' }, completion: { kind: 'native', root } });
});
it('opens resident local projects without constructing a runtime client or requiring a connection', async () => {
  io.needs.mockResolvedValue(false);
  await ensureNativeEditingRootAvailable(root);
  expect(io.client).not.toHaveBeenCalled();
});
it('prepares missing bytes and checks actual local readiness after the runtime result', async () => {
  io.ready.mockResolvedValue(true);
  await ensureNativeEditingRootAvailable(root);
  expect(io.start).toHaveBeenCalledWith(root);
  expect(io.wait).toHaveBeenCalledWith('request');
  expect(io.ready).toHaveBeenCalledOnce();
});
it.each(['failed', 'interrupted', 'wrong-root', 'still-missing', 'lost-job'])(
  'does not admit an editor after %s',
  async (failure) => {
    io.ready.mockResolvedValue(false);
    io.wait.mockResolvedValue({
      job:
        failure === 'lost-job'
          ? null
          : { state: failure === 'wrong-root' || failure === 'still-missing' ? 'ready' : failure },
      completion: {
        kind: 'native',
        root: failure === 'wrong-root' ? { ...root, rootId: 'other' } : root,
      },
    });
    await expect(ensureNativeEditingRootAvailable(root)).rejects.toThrow('unavailable');
  }
);

it('keeps resident offline editing available if advisory usage recording fails', async () => {
  io.needs.mockResolvedValue(false);
  io.touch.mockRejectedValueOnce(new DOMException('No space', 'QuotaExceededError'));
  await expect(ensureNativeEditingRootAvailable(root)).resolves.toBeUndefined();
  expect(io.client).not.toHaveBeenCalled();
});

it('prepares the backup closure without changing editing usage and checks actual readiness', async () => {
  io.ready.mockResolvedValue(true);
  await ensureNativeBackupRootAvailable(root);
  expect(io.needs).toHaveBeenCalledWith(root, 'backup');
  expect(io.backup).toHaveBeenCalledWith(root);
  expect(io.ready).toHaveBeenCalledWith(root, 'backup');
  expect(io.touch).not.toHaveBeenCalled();
});
it('keeps backup admission pending after refused cancellation until actual native execution settles', async () => {
  let finish!: (value: unknown) => void;
  io.wait.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    })
  );
  const abort = new AbortController();
  let settled = false;
  const operation = ensureNativeBackupRootAvailable(root, abort.signal).finally(() => {
    settled = true;
  });
  const observed = expect(operation).rejects.toMatchObject({ name: 'AbortError' });
  await vi.waitFor(() => expect(io.wait).toHaveBeenCalledOnce());
  abort.abort();
  await vi.waitFor(() => expect(io.cancel).toHaveBeenCalledWith('request'));
  expect(settled).toBe(false);
  finish({ job: { state: 'ready' }, completion: { kind: 'native', root } });
  await observed;
  expect(io.ready).not.toHaveBeenCalled();
});
it('does not construct an executor when backup bytes are already local', async () => {
  io.needs.mockResolvedValue(false);
  await ensureNativeBackupRootAvailable(root);
  expect(io.client).not.toHaveBeenCalled();
});

it('holds one reader across sequential publication preparation and writer settlement', async () => {
  const other = { rootKind: 'media' as const, rootId: 'other' };
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  io.ready.mockResolvedValue(true);
  io.wait
    .mockResolvedValueOnce({ job: { state: 'ready' }, completion: { kind: 'native', root } })
    .mockResolvedValueOnce({
      job: { state: 'ready' },
      completion: { kind: 'native', root: other },
    });
  const writer = vi.fn(async () => {
    expect(io.reading).toBe(true);
    await pending;
  });
  const operation = runWithNativePublicationResources([root, root, other], writer);
  await vi.waitFor(() => expect(writer).toHaveBeenCalledOnce());
  expect(io.backup.mock.calls).toEqual([[root], [other]]);
  expect(io.reading).toBe(true);
  finish();
  await operation;
  expect(io.reading).toBe(false);
});
it('releases failed preparation admission and permits retry without native changes', async () => {
  io.backup.mockResolvedValueOnce({ kind: 'refused' });
  const writer = vi.fn(async () => undefined);
  await expect(runWithNativePublicationResources([root], writer)).rejects.toThrow('refused');
  expect(writer).not.toHaveBeenCalled();
  expect(io.reading).toBe(false);
  io.ready.mockResolvedValue(true);
  await runWithNativePublicationResources([root], writer);
  expect(writer).toHaveBeenCalledOnce();
  expect(io.reading).toBe(false);
});
it('preserves resident local publication without a sync connection in production', async () => {
  vi.stubGlobal('__SNIPTALE_SECURITY_E2E__', false);
  io.needs.mockResolvedValue(false);
  const writer = vi.fn(async () => 'local');
  await expect(runWithNativePublicationResources([root], writer)).resolves.toBe('local');
  expect(io.needs).toHaveBeenCalledWith(root, 'backup');
  expect(io.client).not.toHaveBeenCalled();
});
