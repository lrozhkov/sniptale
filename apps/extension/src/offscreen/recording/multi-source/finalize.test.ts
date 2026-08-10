import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import type { FinalizedRecordingStagingArtifact } from '../../../composition/persistence/recordings/staging';
import type { MultiSourceRecorder, MultiSourceSession } from './state';
import { createMultiSourceLifecycle } from './state';
import { TestMediaRecorder } from './media-recorder.test-support';

const {
  commitProjectMock,
  createProjectMock,
  notifySavedMock,
  notifyStoppedMock,
  saveBatchMock,
  updateOutboxMock,
  loadSettingsMock,
} = vi.hoisted(() => ({
  commitProjectMock: vi.fn(),
  createProjectMock: vi.fn(() => ({ id: 'project-1' })),
  notifySavedMock: vi.fn(),
  notifyStoppedMock: vi.fn(),
  saveBatchMock: vi.fn(),
  updateOutboxMock: vi.fn(),
  loadSettingsMock: vi.fn(),
}));

vi.mock('../../../composition/persistence/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/settings')>()),
  loadSettings: loadSettingsMock,
}));

vi.mock('../../../composition/persistence/projects/index-mutations', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../composition/persistence/projects/index-mutations')
  >()),
  commitVideoProjectMutation: commitProjectMock,
}));
vi.mock('../../../features/video/project/factories/multi-source-recording', async (original) => ({
  ...(await original<
    typeof import('../../../features/video/project/factories/multi-source-recording')
  >()),
  createVideoProjectFromMultiSourceRecording: createProjectMock,
}));
vi.mock('../../../workflows/media-hub/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../workflows/media-hub/store')>()),
  saveRecordingsBatchWithCompletionSafely: saveBatchMock,
}));
vi.mock(
  '../../../composition/persistence/recordings/completion-outbox',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../composition/persistence/recordings/completion-outbox')
    >()),
    updateVideoRecordingCompletionOutbox: updateOutboxMock,
  })
);
vi.mock('./messages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./messages')>()),
  notifyMultiSourceSaved: notifySavedMock,
  notifyMultiSourceStopped: notifyStoppedMock,
}));

import { finalizeSession } from './finalize';

function createArtifact(id: string, mimeType = 'video/webm'): FinalizedRecordingStagingArtifact {
  const file = new File([id], `${id}.webm`, { type: mimeType });
  return {
    artifactId: id,
    file,
    filename: file.name,
    mimeType,
    size: file.size,
  };
}

function createRecorder(id: string, index: number): MultiSourceRecorder {
  const recorder = new TestMediaRecorder();
  return {
    artifact: createArtifact(id),
    artifactSession: {
      abort: vi.fn(),
      recorder,
      setLifecycleCallbacks: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    },
    label: `Source ${index + 1}`,
    recorder,
    recordingId: id,
    sourceIndex: index,
    stream: recorder.stream,
    trackSettings: { frameRate: 30, height: 720, width: 1280 },
  };
}

function createSession(id: string): MultiSourceSession {
  return {
    audioRecorder: null,
    durationTimer: null,
    lifecycle: createMultiSourceLifecycle(),
    recorders: [createRecorder(`${id}-window-1`, 0), createRecorder(`${id}-window-2`, 1)],
    recordingId: id,
    settings: DEFAULT_VIDEO_SETTINGS,
    staging: {
      abort: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      getPendingBytes: vi.fn(() => 0),
      openArtifact: vi.fn(),
    },
    startedAt: Date.now() - 1_000,
    stopPromise: null,
    stopReject: null,
    stopResolve: null,
    webcamRecorder: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  saveBatchMock.mockResolvedValue(undefined);
  commitProjectMock.mockResolvedValue(undefined);
  notifySavedMock.mockResolvedValue(undefined);
  notifyStoppedMock.mockResolvedValue(undefined);
  updateOutboxMock.mockResolvedValue(undefined);
  loadSettingsMock.mockRejectedValue(new Error('settings unavailable'));
});

describe('multi-source finalization', () => {
  it('commits every required artifact in one batch before project creation and staging deletion', async () => {
    const session = createSession('multi-batch');
    loadSettingsMock.mockResolvedValueOnce({
      localStoragePolicy: { defaultDestination: 'temporary' },
    });
    await finalizeSession(session);

    expect(saveBatchMock).toHaveBeenCalledOnce();
    expect(saveBatchMock.mock.calls[0]?.[0]).toHaveLength(2);
    expect(saveBatchMock.mock.calls[0]?.[0]).toEqual([
      expect.objectContaining({ storageClass: 'temporary' }),
      expect.objectContaining({ storageClass: 'temporary' }),
    ]);
    expect(saveBatchMock.mock.calls[0]?.[1]).toEqual({
      primaryRecordingId: 'multi-batch-window-1',
      projectId: null,
      recordingId: 'multi-batch',
    });
    expect(commitProjectMock).toHaveBeenCalledWith(expect.objectContaining({ id: 'project-1' }), {
      baseRevision: null,
      storageClass: 'temporary',
    });
    expect(saveBatchMock.mock.invocationCallOrder[0]).toBeLessThan(
      commitProjectMock.mock.invocationCallOrder[0]!
    );
    expect(saveBatchMock.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(session.staging.delete).mock.invocationCallOrder[0]!
    );
    expect(updateOutboxMock).toHaveBeenCalledWith({
      primaryRecordingId: 'multi-batch-window-1',
      projectId: 'project-1',
      recordingId: 'multi-batch',
    });
    expect(updateOutboxMock.mock.invocationCallOrder[0]).toBeLessThan(
      notifySavedMock.mock.invocationCallOrder[0]!
    );
  });

  it('publishes projectId null when optional project creation fails after media commit', async () => {
    const session = createSession('multi-project-failure');
    commitProjectMock.mockRejectedValueOnce(new Error('project failed'));

    await expect(finalizeSession(session)).resolves.toBeUndefined();
    expect(saveBatchMock).toHaveBeenCalledOnce();
    expect(session.staging.delete).toHaveBeenCalledOnce();
    expect(notifySavedMock).toHaveBeenCalledWith({
      primaryRecordingId: 'multi-project-failure-window-1',
      projectId: null,
      recordingId: 'multi-project-failure',
    });
    expect(updateOutboxMock).not.toHaveBeenCalled();
  });

  it('does not create a project or delete staging when the atomic media batch fails', async () => {
    const session = createSession('multi-batch-failure');
    saveBatchMock.mockRejectedValueOnce(new Error('batch failed'));

    await expect(finalizeSession(session)).rejects.toThrow('batch failed');
    expect(commitProjectMock).not.toHaveBeenCalled();
    expect(session.staging.delete).not.toHaveBeenCalled();
  });

  it('continues project and result publication when post-commit staging cleanup fails', async () => {
    const session = createSession('multi-cleanup-failure');
    vi.mocked(session.staging.delete).mockRejectedValueOnce(new Error('cleanup failed'));

    await expect(finalizeSession(session)).resolves.toBeUndefined();
    expect(commitProjectMock).toHaveBeenCalledOnce();
    expect(notifySavedMock).toHaveBeenCalledWith(
      expect.objectContaining({ recordingId: 'multi-cleanup-failure' })
    );
    expect(session.staging.abort).not.toHaveBeenCalled();
  });
});
