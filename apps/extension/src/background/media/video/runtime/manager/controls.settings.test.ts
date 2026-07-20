import { beforeEach, expect, it, vi } from 'vitest';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { installBackgroundRuntimeMessagingMock } from '../../../../routing-contracts/runtime-messaging/mock';

const {
  getVideoRecordingRuntimeStateMock,
  hasActiveVideoRecordingSessionMock,
  loggerErrorMock,
  loggerWarnMock,
  sendRuntimeMessageMock,
  setVideoRecordingRuntimeStateMock,
} = vi.hoisted(() => ({
  getVideoRecordingRuntimeStateMock: vi.fn(),
  hasActiveVideoRecordingSessionMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  sendRuntimeMessageMock: vi.fn(),
  setVideoRecordingRuntimeStateMock: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: () => ({
    error: loggerErrorMock,
    warn: loggerWarnMock,
  }),
}));

vi.mock('../../session-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../session-state')>()),
  hasActiveVideoRecordingSession: hasActiveVideoRecordingSessionMock,
}));

vi.mock('../session-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../session-state')>()),
  getVideoRecordingRuntimeState: getVideoRecordingRuntimeStateMock,
  setVideoRecordingRuntimeState: setVideoRecordingRuntimeStateMock,
}));

import { updateRecordingSettings } from './controls.settings';

beforeEach(() => {
  vi.clearAllMocks();
  hasActiveVideoRecordingSessionMock.mockReturnValue(true);
  sendRuntimeMessageMock.mockResolvedValue(undefined);
  installBackgroundRuntimeMessagingMock({ sendRuntimeMessage: sendRuntimeMessageMock });
  getVideoRecordingRuntimeStateMock.mockReturnValue({
    liveMedia: {
      microphoneDeviceId: 'mic-1',
      microphoneEnabled: true,
      microphoneSelected: true,
      webcamDeviceId: 'cam-1',
      webcamEnabled: true,
      webcamSelected: true,
    },
  });
});

it('forwards live settings to offscreen and publishes live media state', async () => {
  await expect(updateRecordingSettings({ microphoneEnabled: false })).resolves.toEqual({
    result: 'accepted',
  });

  expect(sendRuntimeMessageMock).toHaveBeenCalledWith(
    expect.objectContaining({
      type: VideoMessageType.OFFSCREEN_UPDATE_SETTINGS,
      capabilityToken: expect.any(String),
      settings: { microphoneEnabled: false },
    })
  );
  expect(setVideoRecordingRuntimeStateMock).toHaveBeenCalledWith({
    liveMedia: expect.objectContaining({
      microphoneEnabled: false,
      microphoneSelected: true,
      webcamEnabled: true,
      webcamSelected: true,
    }),
  });
});

it('does not mutate live media state when no recording is active', async () => {
  hasActiveVideoRecordingSessionMock.mockReturnValue(false);

  await expect(updateRecordingSettings({ webcamEnabled: false })).resolves.toEqual({
    result: 'no-active-recording',
  });

  expect(sendRuntimeMessageMock).not.toHaveBeenCalled();
  expect(setVideoRecordingRuntimeStateMock).not.toHaveBeenCalled();
  expect(loggerWarnMock).toHaveBeenCalledWith(
    'Cannot update recording settings because no recording is active'
  );
});

it('reports offscreen update failures without committing live media state', async () => {
  sendRuntimeMessageMock.mockRejectedValueOnce(new Error('offscreen unavailable'));

  await expect(updateRecordingSettings({ webcamEnabled: false })).resolves.toEqual({
    error: 'offscreen unavailable',
    result: 'failed',
  });

  expect(setVideoRecordingRuntimeStateMock).not.toHaveBeenCalled();
  expect(loggerErrorMock).toHaveBeenCalledWith(
    'Failed to update recording settings',
    expect.any(Error)
  );
});

it('keeps a null live media snapshot null after a successful update', async () => {
  getVideoRecordingRuntimeStateMock.mockReturnValue({ liveMedia: null });

  await expect(updateRecordingSettings({ microphoneEnabled: false })).resolves.toEqual({
    result: 'accepted',
  });

  expect(setVideoRecordingRuntimeStateMock).toHaveBeenCalledWith({
    liveMedia: null,
  });
});
