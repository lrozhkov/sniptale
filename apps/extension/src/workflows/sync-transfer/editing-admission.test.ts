import { beforeEach, expect, it, vi } from 'vitest';
import {
  ensureNativeEditingRootAvailable,
  ensureScenarioHtmlArtifactAvailable,
  ensureNativeBackupRootAvailable,
  runWithNativePublicationResources,
} from './editing-admission';
const io = vi.hoisted(() => ({
  needs: vi.fn(),
  htmlReady: vi.fn(),
  htmlStart: vi.fn(),
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
  isNativeScenarioExportReady: io.htmlReady,
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
    prepareScenarioExport: io.htmlStart,
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

const htmlTarget = { projectId: 'guide', exportId: 'historical-html' };
it('admits local saved HTML without a runtime client or other native preparation', async () => {
  io.htmlReady.mockResolvedValueOnce(true);
  await ensureScenarioHtmlArtifactAvailable(htmlTarget);
  expect(io.client).not.toHaveBeenCalled();
  expect(io.needs).not.toHaveBeenCalled();
});
it('waits for its saved HTML receipt and validates both target IDs before actual local readiness', async () => {
  io.htmlReady.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  io.htmlStart.mockResolvedValueOnce({ kind: 'accepted', requestId: 'saved-html' });
  io.wait.mockResolvedValueOnce({
    job: { state: 'ready' },
    completion: { kind: 'scenario-export', ...htmlTarget },
  });
  await ensureScenarioHtmlArtifactAvailable(htmlTarget);
  expect(io.htmlStart).toHaveBeenCalledExactlyOnceWith(htmlTarget);
  expect(io.wait).toHaveBeenCalledWith('saved-html');
  expect(io.htmlReady).toHaveBeenCalledTimes(2);
  expect(io.start).not.toHaveBeenCalled();
  expect(io.backup).not.toHaveBeenCalled();
});
it.each(['projectId', 'exportId'] as const)(
  'refuses another saved HTML %s receipt before a second body readiness read',
  async (field) => {
    io.htmlReady.mockResolvedValue(false);
    io.htmlStart.mockResolvedValueOnce({ kind: 'accepted', requestId: 'saved-html' });
    io.wait.mockResolvedValueOnce({
      job: { state: 'ready' },
      completion: { kind: 'scenario-export', ...htmlTarget, [field]: 'other' },
    });
    await expect(ensureScenarioHtmlArtifactAvailable(htmlTarget)).rejects.toThrow('unavailable');
    expect(io.htmlReady).toHaveBeenCalledTimes(1);
  }
);

it.each(['failed', 'interrupted', 'missing-body', 'missing-job'] as const)(
  'does not admit saved HTML after %s',
  async (failure) => {
    io.htmlReady.mockResolvedValue(false);
    io.htmlStart.mockResolvedValueOnce({ kind: 'accepted', requestId: 'saved-html' });
    io.wait.mockResolvedValueOnce({
      job:
        failure === 'missing-job'
          ? null
          : { state: failure === 'missing-body' ? 'ready' : failure },
      completion: { kind: 'scenario-export', ...htmlTarget },
    });
    await expect(ensureScenarioHtmlArtifactAvailable(htmlTarget)).rejects.toThrow('unavailable');
  }
);
it('keeps saved HTML admission pending through refused cancellation and refuses its final bytes read', async () => {
  io.htmlReady.mockResolvedValue(false);
  io.htmlStart.mockResolvedValueOnce({ kind: 'accepted', requestId: 'saved-html' });
  let finish!: (value: unknown) => void;
  const waiting = new Promise((resolve) => {
    finish = resolve;
  });
  io.wait.mockReturnValueOnce(waiting);
  const abort = new AbortController();
  let settled = false;
  const pending = ensureScenarioHtmlArtifactAvailable(htmlTarget, abort.signal).finally(() => {
    settled = true;
  });
  const result = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  await vi.waitFor(() => expect(io.wait).toHaveBeenCalledWith('saved-html'));
  abort.abort();
  await vi.waitFor(() => expect(io.cancel).toHaveBeenCalledWith('saved-html'));
  expect(settled).toBe(false);
  finish({ job: { state: 'ready' }, completion: { kind: 'scenario-export', ...htmlTarget } });
  await result;
  expect(io.htmlReady).toHaveBeenCalledTimes(1);
});
it('retains a refused saved HTML action for a clean caller retry', async () => {
  io.htmlReady.mockResolvedValue(false);
  io.htmlStart.mockResolvedValueOnce({ kind: 'refused' });
  await expect(ensureScenarioHtmlArtifactAvailable(htmlTarget)).rejects.toThrow('refused');
  expect(io.wait).not.toHaveBeenCalled();
  io.htmlReady.mockResolvedValueOnce(true);
  await ensureScenarioHtmlArtifactAvailable(htmlTarget);
  expect(io.htmlStart).toHaveBeenCalledTimes(1);
});

it('refuses cancellation during an awaited local saved HTML readiness check without starting runtime IO', async () => {
  const abort = new AbortController();
  io.htmlReady.mockImplementationOnce(async () => {
    abort.abort();
    return true;
  });
  await expect(ensureScenarioHtmlArtifactAvailable(htmlTarget, abort.signal)).rejects.toMatchObject(
    { name: 'AbortError' }
  );
  expect(io.client).not.toHaveBeenCalled();
});
