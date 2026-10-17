import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { RecoveryRecording } from './recording-recovery';
import {
  installPersistenceLockManagerForTests,
  isActivePersistenceMutationTransitionPermit,
} from '../../composition/persistence/infrastructure/mutation-barrier';
const mocks = vi.hoisted(() => ({
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
  listRecoverableRecordings: vi.fn(),
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
import { recoverRecording, prepareOriginalRecordingDownload } from './recording-recovery';
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
