import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { installBackgroundRuntimeMessagingMock } from '../../../../routing-contracts/runtime-messaging/mock';

const {
  getVideoRecordingCaptureModeMock,
  getVideoRecordingTabIdMock,
  hasActiveVideoRecordingSessionMock,
  isControlledCursorCaptureEnabledMock,
  isControlledCursorNavigationPendingMock,
  loggerErrorMock,
  loggerWarnMock,
  sendRuntimeMessageMock,
  syncControlledCursorCaptureMock,
} = vi.hoisted(() => ({
  getVideoRecordingCaptureModeMock: vi.fn(),
  getVideoRecordingTabIdMock: vi.fn(),
  hasActiveVideoRecordingSessionMock: vi.fn(),
  isControlledCursorCaptureEnabledMock: vi.fn(),
  isControlledCursorNavigationPendingMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  sendRuntimeMessageMock: vi.fn(),
  syncControlledCursorCaptureMock: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: () => ({
    error: loggerErrorMock,
    warn: loggerWarnMock,
  }),
}));

vi.mock('../../../../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/runtime-messaging')>()),
  sendRuntimeMessage: sendRuntimeMessageMock,
}));

vi.mock('../../session-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../session-state')>()),
  getVideoRecordingCaptureMode: getVideoRecordingCaptureModeMock,
  getVideoRecordingTabId: getVideoRecordingTabIdMock,
  hasActiveVideoRecordingSession: hasActiveVideoRecordingSessionMock,
  isControlledCursorCaptureEnabled: isControlledCursorCaptureEnabledMock,
  isControlledCursorNavigationPending: isControlledCursorNavigationPendingMock,
}));

vi.mock('./controlled-cursor/messages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./controlled-cursor/messages')>()),
  syncControlledCursorCapture: syncControlledCursorCaptureMock,
}));

import { pauseRecording, resumeRecording } from './controls.pause-resume';

beforeEach(() => {
  vi.clearAllMocks();
  getVideoRecordingCaptureModeMock.mockReturnValue(CaptureMode.TAB);
  getVideoRecordingTabIdMock.mockReturnValue(17);
  hasActiveVideoRecordingSessionMock.mockReturnValue(true);
  isControlledCursorCaptureEnabledMock.mockReturnValue(true);
  isControlledCursorNavigationPendingMock.mockReturnValue(false);
  sendRuntimeMessageMock.mockResolvedValue(undefined);
  installBackgroundRuntimeMessagingMock({ sendRuntimeMessage: sendRuntimeMessageMock });
  syncControlledCursorCaptureMock.mockResolvedValue(undefined);
});

function registerActiveTabGuardTest() {
  it('guards pause and resume when there is no active recording tab', async () => {
    hasActiveVideoRecordingSessionMock.mockReturnValue(false);

    await expect(pauseRecording()).resolves.toEqual({ result: 'no-active-recording' });
    await expect(resumeRecording()).resolves.toEqual({ result: 'no-active-recording' });

    expect(loggerWarnMock).toHaveBeenCalledWith('Cannot pause because no recording is active');
    expect(loggerWarnMock).toHaveBeenCalledWith('Cannot resume because no recording is active');
    expect(sendRuntimeMessageMock).not.toHaveBeenCalled();
    expect(syncControlledCursorCaptureMock).not.toHaveBeenCalled();
  });
}

function registerSyncTests() {
  it('forwards pause and resume commands to offscreen and controlled cursor capture transports', async () => {
    await pauseRecording();
    await resumeRecording();

    expect(sendRuntimeMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: VideoMessageType.OFFSCREEN_PAUSE_RECORDING,
        capabilityToken: expect.any(String),
      })
    );
    expect(sendRuntimeMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: VideoMessageType.OFFSCREEN_RESUME_RECORDING,
        capabilityToken: expect.any(String),
      })
    );
    expect(syncControlledCursorCaptureMock).toHaveBeenCalledWith(17, 'pause');
    expect(syncControlledCursorCaptureMock).toHaveBeenCalledWith(17, 'resume');
  });

  it('also syncs telemetry pause and resume for plain tab recordings without controlled cursor capture', async () => {
    isControlledCursorCaptureEnabledMock.mockReturnValue(false);
    getVideoRecordingCaptureModeMock.mockReturnValue(CaptureMode.TAB);

    await pauseRecording();
    await resumeRecording();

    expect(syncControlledCursorCaptureMock).toHaveBeenCalledWith(17, 'pause');
    expect(syncControlledCursorCaptureMock).toHaveBeenCalledWith(17, 'resume');
  });
}

function registerErrorHandlingTests() {
  it('rethrows pause and resume runtime transport failures', async () => {
    sendRuntimeMessageMock.mockRejectedValueOnce(new Error('pause failed'));
    syncControlledCursorCaptureMock
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('resume sync failed'));

    await expect(pauseRecording()).resolves.toEqual({
      result: 'failed',
      error: 'pause failed',
    });
    await expect(resumeRecording()).resolves.toEqual({
      result: 'failed',
      error: 'resume sync failed',
    });

    expect(loggerErrorMock).toHaveBeenCalledWith('Failed to pause recording', expect.any(Error));
    expect(loggerErrorMock).toHaveBeenCalledWith(
      'Failed to resume controlled cursor capture',
      expect.any(Error)
    );
  });
}

function registerNavigationBlockTest() {
  it('skips controlled cursor resume while navigation re-bootstrap is pending', async () => {
    isControlledCursorNavigationPendingMock.mockReturnValue(true);

    await expect(resumeRecording()).resolves.toEqual({ result: 'blocked' });

    expect(syncControlledCursorCaptureMock).not.toHaveBeenCalledWith(17, 'resume');
    expect(loggerWarnMock).toHaveBeenCalledWith(
      'Cannot resume controlled cursor capture while navigation re-bootstrap is pending'
    );
  });
}

describe('controls.pause-resume', () => {
  registerActiveTabGuardTest();
  registerSyncTests();
  registerErrorHandlingTests();
  registerNavigationBlockTest();
});
