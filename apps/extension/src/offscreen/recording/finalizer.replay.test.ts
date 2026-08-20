import { beforeEach, expect, it, vi } from 'vitest';
import type {
  FinalizedRecordingStagingArtifact,
  RecordingStagingCoordinator,
} from '../../composition/persistence/recordings/staging';
import { createPreparedRecordingAssetForTest } from '../../composition/persistence/recordings/staging/test-support';

const { saveBatchMock, sendRuntimeMessageMock } = vi.hoisted(() => ({
  saveBatchMock: vi.fn(),
  sendRuntimeMessageMock: vi.fn(),
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
vi.mock('./signals/static-frame', () => ({ persistStaticFrameSignals: vi.fn() }));

import { finalizeRecording } from './finalizer';

function createArtifact(id: string): FinalizedRecordingStagingArtifact {
  const file = new File(['video'], `${id}.webm`, { type: 'video/webm' });
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
});

it('does not publish an already committed exact recording tuple twice', async () => {
  const artifact = createArtifact('finalizer-replay-exact');
  const firstStaging = createStaging();
  const replayStaging = createStaging();
  const input = {
    artifacts: [artifact],
    discard: false,
    primaryRecordingId: artifact.artifactId,
  } as const;

  await expect(finalizeRecording({ ...input, staging: firstStaging })).resolves.toEqual({
    filename: artifact.filename,
    recordingId: artifact.artifactId,
  });
  await expect(finalizeRecording({ ...input, staging: replayStaging })).resolves.toBeNull();

  expect(saveBatchMock).toHaveBeenCalledOnce();
  expect(replayStaging.delete).toHaveBeenCalledOnce();
});
