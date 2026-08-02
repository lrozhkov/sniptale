import { beforeEach, expect, it, vi } from 'vitest';

const {
  getActiveMultiSourceRecordingIdMock,
  hasActiveMultiSourceRecordingMock,
  pauseMultiSourceRecordingMock,
  retryPendingPostRecordResultMock,
  resumeMultiSourceRecordingMock,
  sendRuntimeMessageMock,
  startMultiSourceRecordingMock,
  startRecordingImplMock,
  stopMultiSourceRecordingMock,
} = vi.hoisted(() => ({
  getActiveMultiSourceRecordingIdMock: vi.fn(),
  hasActiveMultiSourceRecordingMock: vi.fn(),
  pauseMultiSourceRecordingMock: vi.fn(),
  retryPendingPostRecordResultMock: vi.fn(),
  resumeMultiSourceRecordingMock: vi.fn(),
  sendRuntimeMessageMock: vi.fn(),
  startMultiSourceRecordingMock: vi.fn(),
  startRecordingImplMock: vi.fn(),
  stopMultiSourceRecordingMock: vi.fn(),
}));

vi.mock('./start/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./start/index')>()),
  startRecording: startRecordingImplMock,
}));
vi.mock('./start/cleanup', () => ({
  cleanupResources: vi.fn(),
}));
vi.mock('./post-record-publication', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./post-record-publication')>()),
  retryPendingPostRecordResult: retryPendingPostRecordResultMock,
}));

vi.mock('./multi-source', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./multi-source')>()),
  getActiveMultiSourceRecordingId: getActiveMultiSourceRecordingIdMock,
  hasActiveMultiSourceRecording: hasActiveMultiSourceRecordingMock,
  pauseMultiSourceRecording: pauseMultiSourceRecordingMock,
  resumeMultiSourceRecording: resumeMultiSourceRecordingMock,
  startMultiSourceRecording: startMultiSourceRecordingMock,
  stopMultiSourceRecording: stopMultiSourceRecordingMock,
}));

vi.mock('../../platform/runtime-messaging/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/runtime-messaging/index')>()),
  sendRuntimeMessage: sendRuntimeMessageMock,
}));

vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: () => ({ debug: vi.fn() }),
}));

import { pauseRecording, resumeRecording, startRecording, stopRecording } from './controller';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { DEFAULT_VIDEO_OUTPUT_PROFILE } from '@sniptale/runtime-contracts/video/types/types';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { PostRecordPublicationError } from './post-record-publication';

function createSettings() {
  return {
    ...DEFAULT_VIDEO_SETTINGS,
    autoFadeDelay: 0,
    countdownSeconds: 0,
    diagnosticsEnabled: false,
    microphoneDeviceId: null,
    microphoneEnabled: false,
    outputProfile: DEFAULT_VIDEO_OUTPUT_PROFILE,
    sourceCount: 2,
    systemAudioEnabled: true,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getActiveMultiSourceRecordingIdMock.mockReturnValue('multi-1');
  hasActiveMultiSourceRecordingMock.mockReturnValueOnce(false).mockReturnValue(true);
  sendRuntimeMessageMock.mockResolvedValue(undefined);
  retryPendingPostRecordResultMock.mockResolvedValue(false);
  startMultiSourceRecordingMock.mockResolvedValue(undefined);
  stopMultiSourceRecordingMock.mockResolvedValue(undefined);
});

it('retains the multi-source binding and retries only result publication after rejection', async () => {
  await startRecording({
    generation: 1,
    recordingId: 'multi-1',
    streamInstanceId: 'stream-instance-multi-1',
    settings: createSettings(),
    streamId: 'desktop-multi',
  });
  const binding = {
    generation: 1,
    recordingId: 'multi-1',
    streamInstanceId: 'stream-instance-multi-1',
  };
  stopMultiSourceRecordingMock.mockRejectedValueOnce(
    new PostRecordPublicationError(
      { primaryRecordingId: 'multi-1-window-1', projectId: 'project-1', recordingId: 'multi-1' },
      new Error('session storage failed')
    )
  );

  await expect(stopRecording(binding)).rejects.toBeInstanceOf(PostRecordPublicationError);
  retryPendingPostRecordResultMock.mockResolvedValueOnce(true);
  await expect(stopRecording(binding)).resolves.toEqual({ result: 'stopped' });

  expect(stopMultiSourceRecordingMock).toHaveBeenCalledOnce();
  expect(retryPendingPostRecordResultMock).toHaveBeenLastCalledWith(
    'multi-1',
    expect.objectContaining({ sendRuntimeMessage: expect.any(Function) })
  );
});

it('routes multi-source starts to the multi-source session owner', async () => {
  await startRecording({
    generation: 1,
    recordingId: 'multi-1',
    streamInstanceId: 'stream-instance-multi-1',
    settings: createSettings(),
    streamId: 'desktop-multi',
  } as never);

  expect(startMultiSourceRecordingMock).toHaveBeenCalledWith({
    recordingId: 'multi-1',
    settings: expect.objectContaining({ sourceCount: 2, systemAudioEnabled: false }),
  });
  expect(startRecordingImplMock).not.toHaveBeenCalled();
});

it('routes only a matching multi-source stop through the session owner', async () => {
  await startRecording({
    generation: 1,
    recordingId: 'multi-1',
    streamInstanceId: 'stream-instance-multi-1',
    settings: createSettings(),
    streamId: 'desktop-multi',
  });

  const binding = {
    generation: 1,
    recordingId: 'multi-1',
    streamInstanceId: 'stream-instance-multi-1',
  };
  pauseRecording(binding);
  resumeRecording(binding);
  await stopRecording(binding, true);

  expect(stopMultiSourceRecordingMock).toHaveBeenCalledWith(true);
  expect(pauseMultiSourceRecordingMock).toHaveBeenCalledOnce();
  expect(resumeMultiSourceRecordingMock).toHaveBeenCalledOnce();
  expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
    type: VideoMessageType.OFFSCREEN_RECORDING_PAUSED,
    recordingId: 'multi-1',
  });
  expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
    type: VideoMessageType.OFFSCREEN_RECORDING_RESUMED,
    recordingId: 'multi-1',
  });
});
