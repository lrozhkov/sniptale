import { beforeEach, expect, it, vi } from 'vitest';

const {
  getActiveMultiSourceRecordingIdMock,
  hasActiveMultiSourceRecordingMock,
  pauseMultiSourceRecordingMock,
  resumeMultiSourceRecordingMock,
  sendRuntimeMessageMock,
  startMultiSourceRecordingMock,
  startRecordingImplMock,
  stopMultiSourceRecordingMock,
} = vi.hoisted(() => ({
  getActiveMultiSourceRecordingIdMock: vi.fn(),
  hasActiveMultiSourceRecordingMock: vi.fn(),
  pauseMultiSourceRecordingMock: vi.fn(),
  resumeMultiSourceRecordingMock: vi.fn(),
  sendRuntimeMessageMock: vi.fn(),
  startMultiSourceRecordingMock: vi.fn(),
  startRecordingImplMock: vi.fn(),
  stopMultiSourceRecordingMock: vi.fn(),
}));

vi.mock('./start/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./start/index')>()),
  cleanupResources: vi.fn(),
  startRecording: startRecordingImplMock,
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
import { VideoQuality } from '@sniptale/runtime-contracts/video/types/types';

function createSettings() {
  return {
    autoFadeDelay: 0,
    countdownSeconds: 0,
    diagnosticsEnabled: false,
    microphoneDeviceId: null,
    microphoneEnabled: false,
    openEditorAfterRecording: false,
    quality: VideoQuality.HIGH,
    sourceCount: 2,
    systemAudioEnabled: true,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getActiveMultiSourceRecordingIdMock.mockReturnValue('multi-1');
  hasActiveMultiSourceRecordingMock.mockReturnValue(false);
  sendRuntimeMessageMock.mockResolvedValue(undefined);
  startMultiSourceRecordingMock.mockResolvedValue(undefined);
  stopMultiSourceRecordingMock.mockResolvedValue(undefined);
});

it('routes multi-source starts to the multi-source session owner', async () => {
  await startRecording({
    recordingId: 'multi-1',
    settings: createSettings(),
    streamId: 'desktop-multi',
  } as never);

  expect(startMultiSourceRecordingMock).toHaveBeenCalledWith({
    recordingId: 'multi-1',
    settings: expect.objectContaining({ sourceCount: 2, systemAudioEnabled: false }),
  });
  expect(startRecordingImplMock).not.toHaveBeenCalled();
});

it('routes multi-source stop pause and resume through the multi-source session owner', async () => {
  hasActiveMultiSourceRecordingMock.mockReturnValue(true);

  await stopRecording(true);
  pauseRecording();
  resumeRecording();

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
