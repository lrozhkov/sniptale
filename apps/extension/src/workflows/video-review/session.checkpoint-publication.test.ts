import { expect, it, vi } from 'vitest';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import type { VideoWorkspaceSnapshot } from '../../composition/persistence/review-workspaces/contracts';
import { createVideoReviewSession } from './session';
const transportWake = vi.hoisted(() => vi.fn());
vi.mock('../../platform/runtime-messaging/sync-product-client', () => ({
  createSyncProductClient: () => ({ wakeCheckpoints: transportWake }),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function fixture(withWake = true) {
  const wakeCheckpoints = vi.fn(async () => ({ kind: 'checkpoint-woken' as const }));
  const snapshot: VideoWorkspaceSnapshot = {
    workspace: {
      aggregateId: 'recording:r',
      sourceAssetId: 'source',
      formatVersion: 1,
      source: { duration: 4, width: 640, height: 360, mimeType: 'video/webm', size: 5 },
      revision: 1,
      cursor: 0,
      history: [],
      advanced: createQuickEditAdvancedState(),
      createdAt: 1,
      updatedAt: 1,
    },
    draft: null,
  };
  const grant = deferred<{ release(): Promise<void> }>();
  const release = vi.fn(async (): Promise<void> => undefined);
  const acquired = vi.fn(() => grant.promise);
  const read = vi.fn(async () => structuredClone(snapshot));
  const session = createVideoReviewSession(snapshot, {
    acquireSyncCheckpointEdit: acquired,
    ...(withWake ? { wakeCheckpoints } : {}),
    readVideoWorkspace: read,
    saveVideoWorkspaceDraft: read,
    saveVideoWorkspaceSnapshot: read,
    saveVideoWorkspaceAdvanced: read,
    moveVideoWorkspaceHistory: read,
    commitVideoWorkspace: read,
  });
  return {
    wakeCheckpoints,
    session,
    grant: () => grant.resolve({ release }),
    acquired,
    release,
    read,
    snapshot,
  };
}

it('waits for publication admission before a final native command and holds through acknowledgement', async () => {
  const f = fixture();
  const ack = deferred<VideoWorkspaceSnapshot>();
  const started = deferred<void>();
  f.read.mockImplementationOnce(() => {
    started.resolve();
    return ack.promise;
  });
  const save = f.session.saveDraft(null, null);
  expect(f.acquired).toHaveBeenCalledOnce();
  expect(f.read).not.toHaveBeenCalled();
  f.grant();
  await started.promise;
  expect(f.read).toHaveBeenCalledOnce();
  expect(f.release).not.toHaveBeenCalled();
  ack.resolve(f.snapshot);
  await save;
  expect(f.release).toHaveBeenCalledOnce();
  await f.session.dispose();
});

it('keeps a successor action protected after an earlier capture acknowledgement', async () => {
  const f = fixture();
  const first = f.session.beginCheckpointEdit();
  f.grant();
  await f.session.saveDraft(null, null);
  expect(f.release).not.toHaveBeenCalled();
  const second = f.session.beginCheckpointEdit();
  first();
  await f.session.saveDraft(null, null);
  expect(f.release).not.toHaveBeenCalled();
  second();
  await Promise.resolve();
  await Promise.resolve();
  expect(f.release).toHaveBeenCalledOnce();
  await f.session.dispose();
});

it('releases a delayed grant after disposal without starting a native write', async () => {
  const f = fixture();
  const save = f.session.saveDraft(null, null);
  const rejected = expect(save).rejects.toThrow('closed');
  const dispose = f.session.dispose();
  f.grant();
  await rejected;
  await dispose;
  expect(f.read).not.toHaveBeenCalled();
  expect(f.release).toHaveBeenCalledOnce();
});

it('retries failed publication admission through the existing save error', async () => {
  const f = fixture();
  f.acquired.mockRejectedValueOnce(new Error('Admission failed'));
  await expect(f.session.saveDraft(null, null)).rejects.toThrow('Admission failed');
  expect(f.session.getSnapshot().error).toBe('storage');
  expect(f.read).not.toHaveBeenCalled();
  f.grant();
  await f.session.saveDraft(null, null);
  expect(f.acquired).toHaveBeenCalledTimes(2);
  expect(f.session.getSnapshot().error).toBeNull();
  expect(f.release).toHaveBeenCalledOnce();
  await f.session.dispose();
});

it('drains an active native write before disposal releases its publication lease', async () => {
  const f = fixture();
  const started = deferred<void>();
  const ack = deferred<VideoWorkspaceSnapshot>();
  f.read.mockImplementationOnce(() => {
    started.resolve();
    return ack.promise;
  });
  const save = f.session.saveDraft(null, null);
  f.grant();
  await started.promise;
  const disposal = f.session.dispose();
  expect(f.release).not.toHaveBeenCalled();
  ack.resolve(f.snapshot);
  await save;
  await disposal;
  expect(f.release).toHaveBeenCalledOnce();
});

it('wakes Review once after its accepted final native ACK and release settle', async () => {
  const f = fixture();
  const released = deferred<void>();
  f.release.mockImplementationOnce(() => released.promise);
  const end = f.session.beginCheckpointEdit();
  f.grant();
  f.read.mockResolvedValue({ ...f.snapshot, workspace: { ...f.snapshot.workspace, revision: 2 } });
  await f.session.saveDraft(null, null);
  expect(f.wakeCheckpoints).not.toHaveBeenCalled();
  end();
  await Promise.resolve();
  await Promise.resolve();
  expect(f.release).toHaveBeenCalledOnce();
  expect(f.wakeCheckpoints).not.toHaveBeenCalled();
  released.resolve();
  await f.session.dispose();
  expect(f.wakeCheckpoints).toHaveBeenCalledOnce();
});

it('does not wake Review for a no-op or a refused native action', async () => {
  const f = fixture();
  f.grant();
  await f.session.saveDraft(null, null);
  expect(f.wakeCheckpoints).not.toHaveBeenCalled();
  f.read.mockRejectedValueOnce(new Error('Refused'));
  await expect(f.session.saveDraft(null, null)).rejects.toThrow('Refused');
  await f.session.dispose();
  expect(f.wakeCheckpoints).not.toHaveBeenCalled();
});

it('keeps Review saved when its optional advisory wake rejects', async () => {
  const f = fixture();
  f.grant();
  f.wakeCheckpoints.mockRejectedValueOnce(new Error('Worker unavailable'));
  f.read.mockResolvedValue({ ...f.snapshot, workspace: { ...f.snapshot.workspace, revision: 2 } });
  await f.session.saveDraft(null, null);
  await f.session.dispose();
  expect(f.wakeCheckpoints).toHaveBeenCalledOnce();
  expect(f.session.getSnapshot()).toMatchObject({ error: null, dirty: false });
});

it('accepts an injected Review persistence adapter without a wake transport', async () => {
  const f = fixture(false);
  f.grant();
  f.read.mockResolvedValue({ ...f.snapshot, workspace: { ...f.snapshot.workspace, revision: 2 } });
  await f.session.saveDraft(null, null);
  await f.session.dispose();
  expect(f.wakeCheckpoints).not.toHaveBeenCalled();
  expect(transportWake).not.toHaveBeenCalled();
  expect(f.session.getSnapshot().error).toBeNull();
});

it('does not wake Review for a read-only reload of a newer canonical snapshot', async () => {
  const f = fixture();
  f.grant();
  f.read.mockResolvedValue({ ...f.snapshot, workspace: { ...f.snapshot.workspace, revision: 2 } });
  await f.session.reload();
  await f.session.dispose();
  expect(f.wakeCheckpoints).not.toHaveBeenCalled();
});
