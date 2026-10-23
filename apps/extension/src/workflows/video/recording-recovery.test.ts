import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { RecoveryRecording } from './recording-recovery';
import {
  installPersistenceLockManagerForTests,
  isActivePersistenceMutationTransitionPermit,
} from '../../composition/persistence/infrastructure/mutation-barrier';
const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  read: vi.fn(),
  lock: vi.fn(),
  get: vi.fn(),
  publish: vi.fn(),
  remux: vi.fn(),
  releaseOriginal: vi.fn(),
  releaseResult: vi.fn(),
  releaseProtection: vi.fn(),
}));
vi.mock('../../composition/persistence/recordings/recovery', () => ({
  listRecoverableRecordings: mocks.list,
  deleteRecoveryRecording: vi.fn(),
  readRecoveryRecording: mocks.read,
  withRecoveryRecording: mocks.lock,
}));
vi.mock('../../composition/persistence/recordings', () => ({ getRecording: mocks.get }));
vi.mock('../media-hub/store', () => ({ saveRecordingsBatchSafely: mocks.publish }));
vi.mock('./recording-recovery-remux', () => ({ remuxRecoveryRecording: mocks.remux }));
vi.mock('../../composition/persistence/assets', () => ({
  releaseAssetReadyProtection: mocks.releaseProtection,
}));
import {
  recoverRecording,
  prepareOriginalRecordingDownload,
  listRecoverableRecordings,
} from './recording-recovery';
const entry: RecoveryRecording = {
  id: 'original',
  recoveryId: 'recovered',
  incarnation: 'incarnation',
  epoch: 'epoch',
  filename: 'recording.webm',
  mimeType: 'video/webm',
  createdAt: 1,
  size: 100,
  blockCount: 1,
  complete: false,
  published: false,
};
const original = new File(['original+suffix'], 'recording.webm');
const recovered = new File(['playable prefix'], 'recording.webm');
const preparedAsset = { ref: { assetId: 'recovered-asset' } };
beforeEach(() => {
  vi.clearAllMocks();
  installPersistenceLockManagerForTests({
    async request(_name, _options, operation) {
      return operation();
    },
  });
  mocks.list.mockResolvedValue([]);
  mocks.get.mockResolvedValue(undefined);
  mocks.lock.mockImplementation(
    async (
      _id: string,
      _incarnation: string,
      operation: (entry: RecoveryRecording) => Promise<unknown>
    ) => operation(entry)
  );
  mocks.read.mockResolvedValue({ entry, file: original, release: mocks.releaseOriginal });
  mocks.remux.mockResolvedValue({ file: recovered, preparedAsset, release: mocks.releaseResult });
  mocks.publish.mockResolvedValue(undefined);
});
afterEach(() => installPersistenceLockManagerForTests(null));
it('reports preparation before reading and publication only after validated remux', async () => {
  const observer = vi.fn();
  mocks.read.mockImplementation(async () => {
    expect(observer).toHaveBeenLastCalledWith({ stage: 'preparing', completed: 0 });
    return { file: original, release: mocks.releaseOriginal };
  });
  mocks.publish.mockImplementation(async () => {
    expect(observer).toHaveBeenLastCalledWith({ stage: 'publishing', completed: 0 });
  });
  await recoverRecording(entry, observer);
  expect(mocks.remux).toHaveBeenCalledWith(original, expect.any(Object), observer);
});
it('does not report publication after validation fails and can retry with an unavailable observer', async () => {
  const observer = vi.fn();
  mocks.remux.mockRejectedValueOnce(new Error('decode'));
  await expect(recoverRecording(entry, observer)).rejects.toThrow('decode');
  expect(observer).toHaveBeenCalledExactlyOnceWith({ stage: 'preparing', completed: 0 });
  await expect(
    recoverRecording(entry, () => {
      throw new Error('UI gone');
    })
  ).resolves.toBe('recovered');
});
it('publishes a separate validated prefix with the source incarnation and retains original bytes', async () => {
  expect(await recoverRecording(entry)).toBe('recovered');
  expect(mocks.publish).toHaveBeenCalledWith([
    {
      id: 'recovered',
      preparedAsset,
      filename: entry.filename,
      recoverySource: { id: 'original', incarnation: 'incarnation', epoch: 'epoch' },
    },
  ]);
  expect(mocks.releaseOriginal).toHaveBeenCalledOnce();
  expect(mocks.releaseResult).not.toHaveBeenCalled();
  expect(mocks.releaseProtection).toHaveBeenCalledWith(['recovered-asset']);
  expect(await original.text()).toBe('original+suffix');
});
it('retains originals and releases protection without deleting publication-owned output after failure', async () => {
  mocks.publish.mockRejectedValueOnce(new Error('quota'));
  await expect(recoverRecording(entry)).rejects.toThrow('quota');
  expect(mocks.releaseOriginal).toHaveBeenCalledOnce();
  expect(mocks.releaseResult).not.toHaveBeenCalled();
  expect(mocks.releaseProtection).toHaveBeenCalledWith(['recovered-asset']);
  expect(await recoverRecording(entry)).toBe('recovered');
  expect(await original.text()).toBe('original+suffix');
});
it('passes the same active transition permit through snapshot and remux', async () => {
  let snapshotPermit: unknown;
  mocks.read.mockImplementation(async (_id: string, permit: unknown) => {
    expect(isActivePersistenceMutationTransitionPermit(permit)).toBe(true);
    snapshotPermit = permit;
    return { entry, file: original, release: mocks.releaseOriginal };
  });
  mocks.remux.mockImplementation(async (_file: File, permit: unknown) => {
    expect(permit).toBe(snapshotPermit);
    expect(isActivePersistenceMutationTransitionPermit(permit)).toBe(true);
    return { file: recovered, preparedAsset, release: mocks.releaseResult };
  });
  await recoverRecording(entry);
  expect(isActivePersistenceMutationTransitionPermit(snapshotPermit)).toBe(false);
});
it('does not publish unreadable data as a recovered recording', async () => {
  mocks.remux.mockRejectedValueOnce(new Error('decode'));
  await expect(recoverRecording(entry)).rejects.toThrow('decode');
  expect(mocks.publish).not.toHaveBeenCalled();
  expect(mocks.releaseOriginal).toHaveBeenCalledOnce();
});
it('refuses an existing stable target on command retry without overwriting it', async () => {
  mocks.get.mockResolvedValue({ id: 'recovered' });
  await expect(recoverRecording(entry)).rejects.toThrow('recovery target already exists');
  expect(mocks.read).not.toHaveBeenCalled();
  expect(mocks.publish).not.toHaveBeenCalled();
});
it('rejects a busy or stale incarnation before reading or publishing', async () => {
  mocks.lock.mockRejectedValue(new Error('busy'));
  await expect(recoverRecording(entry)).rejects.toThrow('busy');
  expect(mocks.read).not.toHaveBeenCalled();
  expect(mocks.publish).not.toHaveBeenCalled();
});
it('hands the raw snapshot release to the download owner and never deletes source bytes', async () => {
  const result = await prepareOriginalRecordingDownload(entry);
  expect(result.file).toBe(original);
  expect(result.release).toBe(mocks.releaseOriginal);
  expect(mocks.releaseOriginal).not.toHaveBeenCalled();
  expect(mocks.remux).not.toHaveBeenCalled();
  expect(mocks.publish).not.toHaveBeenCalled();
});

// Discovery must distinguish a saved video from a failed publication or lost canonical bytes.
it.each(['original', 'recovered'])(
  'hides internally retained blocks when published %s is readable',
  async (id) => {
    mocks.list.mockResolvedValue([{ ...entry, published: true }]);
    mocks.get.mockImplementation(async (candidate: string) =>
      candidate === id ? { id, file: recovered } : undefined
    );
    expect(await listRecoverableRecordings()).toEqual([]);
    expect(mocks.publish).not.toHaveBeenCalled();
    expect(mocks.read).not.toHaveBeenCalled();
  }
);
it('exposes retained blocks when both published targets are unavailable', async () => {
  const saved = { ...entry, complete: true, published: true };
  mocks.list.mockResolvedValue([saved]);
  expect(await listRecoverableRecordings()).toEqual([saved]);
  expect(mocks.get.mock.calls).toEqual([['original'], ['recovered']]);
});
it('keeps failed publication visible even when encoding completed', async () => {
  const failed = { ...entry, complete: true };
  mocks.list.mockResolvedValue([failed]);
  expect(await listRecoverableRecordings()).toEqual([failed]);
  expect(mocks.get).not.toHaveBeenCalled();
});
it('does not report a failed canonical availability check as empty recovery', async () => {
  mocks.list.mockResolvedValue([{ ...entry, published: true }]);
  mocks.get.mockRejectedValue(new Error('database unavailable'));
  await expect(listRecoverableRecordings()).rejects.toThrow('database unavailable');
});
