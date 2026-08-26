import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  FinalizedRecordingStagingArtifact,
  RecordingStagingCoordinator,
} from '../../composition/persistence/recordings/staging';
import { createPreparedRecordingAssetForTest } from '../../composition/persistence/recordings/staging/test-support';

const { loadSettingsMock, persistStaticFrameSignalsMock, saveBatchMock, sendRuntimeMessageMock } =
  vi.hoisted(() => ({
    loadSettingsMock: vi.fn(),
    persistStaticFrameSignalsMock: vi.fn(),
    saveBatchMock: vi.fn(),
    sendRuntimeMessageMock: vi.fn(),
  }));

vi.mock('../../composition/persistence/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../composition/persistence/settings')>()),
  loadSettings: loadSettingsMock,
}));

vi.mock('../../workflows/media-hub/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../workflows/media-hub/store')>()),
  saveRecordingsBatchWithCompletionSafely: saveBatchMock,
}));

vi.mock('../../platform/runtime-messaging/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/runtime-messaging/index')>()),
  sendRuntimeMessage: sendRuntimeMessageMock,
}));

vi.mock('../../composition/persistence/recordings/completion-outbox', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../composition/persistence/recordings/completion-outbox')
  >()),
  readVideoRecordingCompletionOutbox: vi.fn(async () => saveBatchMock.mock.lastCall?.[1]),
  removeVideoRecordingCompletionOutbox: vi.fn().mockResolvedValue(true),
}));

vi.mock('./signals/static-frame', () => ({
  persistStaticFrameSignals: persistStaticFrameSignalsMock,
}));

import { finalizeRecording } from './finalizer';

function createArtifact(id: string, contents = id): FinalizedRecordingStagingArtifact {
  const file = new File([contents], `${id}.webm`, { type: 'video/webm' });
  return {
    artifactId: id,
    asset: createPreparedRecordingAssetForTest(file, id),
    filename: file.name,
    mimeType: file.type,
    size: file.size,
  };
}

function createStaging(): RecordingStagingCoordinator {
  return {
    abort: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    getPendingBytes: vi.fn(() => 0),
    openArtifact: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  saveBatchMock.mockResolvedValue(undefined);
  sendRuntimeMessageMock.mockResolvedValue({ success: true, result: 'accepted' });
  loadSettingsMock.mockRejectedValue(new Error('settings unavailable'));
});

describe('recording finalizer', () => {
  it('commits primary and sidecar artifacts atomically before deleting staging', async () => {
    const staging = createStaging();
    const primary = createArtifact('finalizer-batch-primary');
    const webcam = createArtifact('finalizer-batch-webcam');
    loadSettingsMock.mockResolvedValueOnce({
      localStoragePolicy: { defaultDestination: 'temporary' },
    });

    await expect(
      finalizeRecording({
        artifacts: [primary, webcam],
        discard: false,
        primaryRecordingId: primary.artifactId,
        recordingGroups: {
          [primary.artifactId]: {
            dimensions: { height: 1080, width: 1920 },
            groupId: primary.artifactId,
            order: 0,
            role: 'display',
            sourceLabel: 'Design review',
          },
          [webcam.artifactId]: {
            dimensions: { height: 720, width: 1280 },
            groupId: primary.artifactId,
            order: 1,
            role: 'webcam',
            sourceLabel: 'HD Camera',
          },
        },
        staging,
      })
    ).resolves.toEqual({ filename: primary.filename, recordingId: primary.artifactId });

    expect(saveBatchMock).toHaveBeenCalledWith(
      [
        {
          preparedAsset: primary.asset,
          filename: primary.filename,
          id: primary.artifactId,
          recordingGroup: expect.objectContaining({
            dimensions: { height: 1080, width: 1920 },
            role: 'display',
            sourceLabel: 'Design review',
          }),
          storageClass: 'temporary',
        },
        {
          preparedAsset: webcam.asset,
          filename: webcam.filename,
          id: webcam.artifactId,
          recordingGroup: expect.objectContaining({
            dimensions: { height: 720, width: 1280 },
            role: 'webcam',
            sourceLabel: 'HD Camera',
          }),
          storageClass: 'temporary',
        },
      ],
      {
        primaryRecordingId: primary.artifactId,
        projectId: null,
        recordingId: primary.artifactId,
      }
    );
    expect(saveBatchMock.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(staging.delete).mock.invocationCallOrder[0]!
    );
    expect(persistStaticFrameSignalsMock).toHaveBeenCalledWith(primary.artifactId);
  });

  it('aborts staging without publishing media when discarded', async () => {
    const staging = createStaging();
    await expect(
      finalizeRecording({
        artifacts: [createArtifact('finalizer-discard')],
        discard: true,
        primaryRecordingId: 'finalizer-discard',
        staging,
      })
    ).resolves.toBeNull();

    expect(staging.abort).toHaveBeenCalledOnce();
    expect(saveBatchMock).not.toHaveBeenCalled();
  });

  it('aborts staging and surfaces an atomic batch failure', async () => {
    const saveError = new Error('batch failed');
    const staging = createStaging();
    saveBatchMock.mockRejectedValueOnce(saveError);

    await expect(
      finalizeRecording({
        artifacts: [createArtifact('finalizer-failure')],
        discard: false,
        primaryRecordingId: 'finalizer-failure',
        staging,
      })
    ).rejects.toBe(saveError);
    expect(staging.abort).toHaveBeenCalledOnce();
    expect(staging.delete).not.toHaveBeenCalled();
  });

  it('continues publication when cleanup fails after the durable batch commit', async () => {
    const staging = createStaging();
    vi.mocked(staging.delete).mockRejectedValueOnce(new Error('cleanup failed'));
    const artifact = createArtifact('finalizer-cleanup-failure');

    await expect(
      finalizeRecording({
        artifacts: [artifact],
        discard: false,
        primaryRecordingId: artifact.artifactId,
        staging,
      })
    ).resolves.toEqual({ filename: artifact.filename, recordingId: artifact.artifactId });
    expect(staging.abort).not.toHaveBeenCalled();
    expect(sendRuntimeMessageMock).toHaveBeenCalled();
  });

  it('rejects a partial artifact set before any publication', async () => {
    const staging = createStaging();
    await expect(
      finalizeRecording({
        artifacts: [createArtifact('another-artifact')],
        discard: false,
        primaryRecordingId: 'missing-primary',
        staging,
      })
    ).rejects.toThrow('Primary recording artifact is unavailable');
    expect(saveBatchMock).not.toHaveBeenCalled();
  });

  it('supports silent finalization without saved or stopped notifications', async () => {
    const staging = createStaging();
    const artifact = createArtifact('finalizer-silent');

    await finalizeRecording({
      artifacts: [artifact],
      discard: false,
      options: { notifySaved: false, notifyStopped: false },
      primaryRecordingId: artifact.artifactId,
      staging,
    });

    expect(sendRuntimeMessageMock).not.toHaveBeenCalled();
  });
});
