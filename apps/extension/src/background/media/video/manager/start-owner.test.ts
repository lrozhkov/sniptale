import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { installBackgroundRuntimeMessagingMock } from '../../../routing-contracts/runtime-messaging/mock';

const {
  beginVideoRecordingPreparationMock,
  beginPreparedRecordingMock,
  clearActiveVideoRecordingLeaseMock,
  finalizeRecordingStartMock,
  initializeRecordingContextMock,
  hasActiveVideoRecordingSessionMock,
  issuePreparedVideoRecordingLeaseMock,
  isStartCancelledMock,
  isVideoRecordingPreparationInProgressMock,
  notifyRecordingStartFailedMock,
  runCountdownMock,
  releaseVideoCaptureSurfaceMock,
  readStoredVideoPostRecordResultMock,
  scheduleRecordingStartActivationWatchdogMock,
  sendRuntimeMessageMock,
  setVideoRecordingIdMock,
  waitForVideoCaptureSurfaceRecoveryMock,
} = vi.hoisted(() => ({
  beginVideoRecordingPreparationMock: vi.fn(),
  beginPreparedRecordingMock: vi.fn(),
  clearActiveVideoRecordingLeaseMock: vi.fn(),
  finalizeRecordingStartMock: vi.fn(),
  initializeRecordingContextMock: vi.fn(),
  hasActiveVideoRecordingSessionMock: vi.fn(),
  issuePreparedVideoRecordingLeaseMock: vi.fn(),
  isStartCancelledMock: vi.fn(),
  isVideoRecordingPreparationInProgressMock: vi.fn(),
  notifyRecordingStartFailedMock: vi.fn(),
  runCountdownMock: vi.fn(),
  releaseVideoCaptureSurfaceMock: vi.fn(),
  readStoredVideoPostRecordResultMock: vi.fn(),
  scheduleRecordingStartActivationWatchdogMock: vi.fn(),
  sendRuntimeMessageMock: vi.fn(),
  setVideoRecordingIdMock: vi.fn(),
  waitForVideoCaptureSurfaceRecoveryMock: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({ log: vi.fn(), warn: vi.fn() }),
}));
vi.mock('../../../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/runtime-messaging')>()),
  sendRuntimeMessage: sendRuntimeMessageMock,
}));
vi.mock('../runtime/manager', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../runtime/manager')>()),
  notifyRecordingStartFailed: notifyRecordingStartFailedMock,
}));
vi.mock('../session-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../session-state')>()),
  beginVideoRecordingPreparation: beginVideoRecordingPreparationMock,
  hasActiveVideoRecordingSession: hasActiveVideoRecordingSessionMock,
  isVideoRecordingPreparationInProgress: isVideoRecordingPreparationInProgressMock,
  setVideoRecordingId: setVideoRecordingIdMock,
}));
vi.mock('../recording-control-lease', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../recording-control-lease')>()),
  activateVideoRecordingLease: vi.fn().mockResolvedValue({ controlToken: 'control-token-1' }),
  clearActiveVideoRecordingLease: clearActiveVideoRecordingLeaseMock,
  issuePreparedVideoRecordingLease: issuePreparedVideoRecordingLeaseMock,
}));
vi.mock('./flow', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./flow')>()),
  finalizeRecordingStart: finalizeRecordingStartMock,
  beginPreparedRecording: beginPreparedRecordingMock,
  isStartCancelled: isStartCancelledMock,
  runCountdown: runCountdownMock,
}));
vi.mock('../capture-surface', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../capture-surface')>()),
  releaseVideoCaptureSurface: releaseVideoCaptureSurfaceMock,
  waitForVideoCaptureSurfaceRecovery: waitForVideoCaptureSurfaceRecoveryMock,
}));
vi.mock('../../../storage/video/post-record-result', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../storage/video/post-record-result')>()),
  readStoredVideoPostRecordResult: readStoredVideoPostRecordResultMock,
}));
vi.mock('./recording-context.prepare', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./recording-context.prepare')>()),
  initializeRecordingContext: initializeRecordingContextMock,
}));
vi.mock('./start-activation-watchdog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./start-activation-watchdog')>()),
  scheduleRecordingStartActivationWatchdog: scheduleRecordingStartActivationWatchdogMock,
}));
import { CaptureMode, VideoQuality } from '@sniptale/runtime-contracts/video/types/types';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { startRecording } from './start';
import { reserveMediaErasureExclusion } from '../../../mutation-exclusion/media-activity';

const settings = {
  ...DEFAULT_VIDEO_SETTINGS,
  microphoneEnabled: false,
  microphoneDeviceId: null,
  systemAudioEnabled: true,
  quality: VideoQuality.HIGH,
  countdownSeconds: 3,
  autoFadeDelay: 1500,
  interactionDiagnosticsEnabled: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'recording-1') });
  clearActiveVideoRecordingLeaseMock.mockResolvedValue(undefined);
  hasActiveVideoRecordingSessionMock.mockReturnValue(false);
  isStartCancelledMock.mockReturnValue(false);
  isVideoRecordingPreparationInProgressMock.mockReturnValue(false);
  runCountdownMock.mockResolvedValue(true);
  beginPreparedRecordingMock.mockResolvedValue(undefined);
  finalizeRecordingStartMock.mockResolvedValue('stream-instance-1');
  releaseVideoCaptureSurfaceMock.mockResolvedValue(undefined);
  readStoredVideoPostRecordResultMock.mockResolvedValue(null);
  waitForVideoCaptureSurfaceRecoveryMock.mockResolvedValue(undefined);
  sendRuntimeMessageMock.mockImplementation((message: { type?: string }) =>
    message.type === VideoMessageType.OFFSCREEN_STOP_RECORDING
      ? Promise.resolve({ success: true, result: 'accepted' })
      : Promise.resolve(undefined)
  );
  installBackgroundRuntimeMessagingMock({ sendRuntimeMessage: sendRuntimeMessageMock });
  initializeRecordingContextMock.mockResolvedValue({
    captureMode: CaptureMode.TAB,
    captureSource: { mode: CaptureMode.TAB, streamId: 'stream-1' },
    generation: 1,
    settings,
    surface: null,
    tabId: 17,
    viewport: null,
  });
  issuePreparedVideoRecordingLeaseMock.mockResolvedValue({
    controlToken: 'control-token-1',
    recordingId: 'recording-1',
  });
  notifyRecordingStartFailedMock.mockImplementation(async () => {
    await releaseVideoCaptureSurfaceMock('recording-1');
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function waitForMockCall(mock: ReturnType<typeof vi.fn>): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    if (mock.mock.calls.length > 0) {
      return;
    }
    await Promise.resolve();
  }
}

it('fails closed before preparation when no recording owner sender is provided', async () => {
  await expect(startRecording(17, settings)).resolves.toEqual({
    error: 'Unauthorized recording control sender',
    result: 'failed',
  });

  expect(beginVideoRecordingPreparationMock).not.toHaveBeenCalled();
  expect(initializeRecordingContextMock).not.toHaveBeenCalled();
});

it('issues an owner-bound control lease before accepting a recording start', async () => {
  const ownerSenderUrl = 'chrome-extension://test/apps/extension/src/popup/index.html';

  await expect(
    startRecording(17, settings, CaptureMode.TAB, undefined, ownerSenderUrl)
  ).resolves.toEqual({
    controlToken: 'control-token-1',
    recordingId: 'recording-1',
    result: 'accepted',
  });

  expect(setVideoRecordingIdMock).toHaveBeenCalledWith('recording-1');
  expect(scheduleRecordingStartActivationWatchdogMock).toHaveBeenCalledWith('recording-1');
  expect(issuePreparedVideoRecordingLeaseMock).toHaveBeenCalledWith({
    captureMode: CaptureMode.TAB,
    cropRegion: null,
    ownerSenderUrl,
    surfaceBinding: { generation: 1, streamInstanceId: 'recording-1' },
    viewportPresetId: undefined,
  });
  expect(finalizeRecordingStartMock).toHaveBeenCalledTimes(1);
  expect(finalizeRecordingStartMock.mock.invocationCallOrder[0]).toBeLessThan(
    scheduleRecordingStartActivationWatchdogMock.mock.invocationCallOrder[0] ?? 0
  );
});

it('fails visibly before preparation while local data erasure owns media lifecycle', async () => {
  let releaseErasure!: () => void;
  const erasureGate = new Promise<void>((resolve) => {
    releaseErasure = resolve;
  });
  const exclusion = reserveMediaErasureExclusion();
  const erasure = erasureGate.finally(() => exclusion.release());
  const ownerSenderUrl = 'chrome-extension://test/apps/extension/src/popup/index.html';

  await expect(
    startRecording(17, settings, CaptureMode.TAB, undefined, ownerSenderUrl)
  ).resolves.toEqual({
    error: 'Local data erasure is in progress',
    result: 'failed',
  });
  expect(beginVideoRecordingPreparationMock).not.toHaveBeenCalled();

  releaseErasure();
  await erasure;
});

it.each(['staged', 'ready'] as const)(
  'blocks a direct start while a previous result is %s',
  async (status) => {
    readStoredVideoPostRecordResultMock.mockResolvedValueOnce({
      acknowledgedBy: null,
      createdAt: 1,
      expiresAt: Date.now() + 1_000,
      result: {
        primaryRecordingId: 'recording-previous',
        projectId: null,
        recordingId: 'recording-previous',
      },
      status,
    });

    await expect(
      startRecording(
        17,
        settings,
        CaptureMode.TAB,
        null,
        'chrome-extension://test/apps/extension/src/popup/index.html'
      )
    ).resolves.toEqual({
      error: 'Resolve the previous recording before starting another.',
      result: 'failed',
    });

    expect(beginVideoRecordingPreparationMock).not.toHaveBeenCalled();
    expect(initializeRecordingContextMock).not.toHaveBeenCalled();
  }
);

it('fails closed before preparation when post-record authority cannot be read', async () => {
  readStoredVideoPostRecordResultMock.mockRejectedValueOnce(new Error('session unavailable'));

  await expect(
    startRecording(
      17,
      settings,
      CaptureMode.TAB,
      null,
      'chrome-extension://test/apps/extension/src/popup/index.html'
    )
  ).resolves.toEqual({ error: 'session unavailable', result: 'failed' });

  expect(beginVideoRecordingPreparationMock).not.toHaveBeenCalled();
  expect(initializeRecordingContextMock).not.toHaveBeenCalled();
});

it('waits for startup recovery before inspecting session state or preparing a current-size start', async () => {
  let finishRecovery!: () => void;
  waitForVideoCaptureSurfaceRecoveryMock.mockReturnValueOnce(
    new Promise<void>((resolve) => {
      finishRecovery = resolve;
    })
  );
  const ownerSenderUrl = 'chrome-extension://test/apps/extension/src/popup/index.html';

  const start = startRecording(17, settings, CaptureMode.TAB, null, ownerSenderUrl);
  await Promise.resolve();

  expect(isVideoRecordingPreparationInProgressMock).not.toHaveBeenCalled();
  expect(beginVideoRecordingPreparationMock).not.toHaveBeenCalled();
  expect(initializeRecordingContextMock).not.toHaveBeenCalled();
  expect(issuePreparedVideoRecordingLeaseMock).not.toHaveBeenCalled();
  expect(finalizeRecordingStartMock).not.toHaveBeenCalled();

  finishRecovery();

  await expect(start).resolves.toMatchObject({ result: 'accepted' });
  expect(isVideoRecordingPreparationInProgressMock).toHaveBeenCalledOnce();
  expect(beginVideoRecordingPreparationMock).toHaveBeenCalledOnce();
  expect(initializeRecordingContextMock).toHaveBeenCalledOnce();
});

it('detects an active recording hydrated by startup recovery before preparing a new start', async () => {
  let finishRecovery!: () => void;
  waitForVideoCaptureSurfaceRecoveryMock.mockReturnValueOnce(
    new Promise<void>((resolve) => {
      finishRecovery = resolve;
    })
  );
  const ownerSenderUrl = 'chrome-extension://test/apps/extension/src/popup/index.html';

  const start = startRecording(17, settings, CaptureMode.TAB, null, ownerSenderUrl);
  await Promise.resolve();
  expect(hasActiveVideoRecordingSessionMock).not.toHaveBeenCalled();

  hasActiveVideoRecordingSessionMock.mockReturnValueOnce(true);
  finishRecovery();

  await expect(start).resolves.toEqual({ result: 'already-active' });
  expect(hasActiveVideoRecordingSessionMock).toHaveBeenCalledOnce();
  expect(beginVideoRecordingPreparationMock).not.toHaveBeenCalled();
  expect(initializeRecordingContextMock).not.toHaveBeenCalled();
});

it('rejects a new start while retryable startup recovery still owns the previous source', async () => {
  waitForVideoCaptureSurfaceRecoveryMock.mockRejectedValueOnce(
    new Error('Previous recording recovery is awaiting an exact stop acknowledgement')
  );
  const ownerSenderUrl = 'chrome-extension://test/apps/extension/src/popup/index.html';

  await expect(
    startRecording(17, settings, CaptureMode.TAB, null, ownerSenderUrl)
  ).resolves.toEqual({
    error: 'Previous recording recovery is awaiting an exact stop acknowledgement',
    result: 'failed',
  });

  expect(isVideoRecordingPreparationInProgressMock).not.toHaveBeenCalled();
  expect(hasActiveVideoRecordingSessionMock).not.toHaveBeenCalled();
  expect(beginVideoRecordingPreparationMock).not.toHaveBeenCalled();
  expect(issuePreparedVideoRecordingLeaseMock).not.toHaveBeenCalled();
});

it('persists source authority before delivery and waits to arm the activation watchdog', async () => {
  let acceptOffscreenStart!: (streamInstanceId: string) => void;
  const offscreenStartDelivery = new Promise<string>((resolve) => {
    acceptOffscreenStart = resolve;
  });
  finalizeRecordingStartMock.mockReturnValueOnce(offscreenStartDelivery);
  const ownerSenderUrl = 'chrome-extension://test/apps/extension/src/popup/index.html';

  const start = startRecording(17, settings, CaptureMode.TAB, undefined, ownerSenderUrl);
  await waitForMockCall(finalizeRecordingStartMock);

  expect(issuePreparedVideoRecordingLeaseMock).toHaveBeenCalledWith({
    captureMode: CaptureMode.TAB,
    cropRegion: null,
    ownerSenderUrl,
    surfaceBinding: { generation: 1, streamInstanceId: 'recording-1' },
    viewportPresetId: undefined,
  });
  expect(issuePreparedVideoRecordingLeaseMock.mock.invocationCallOrder[0]).toBeLessThan(
    finalizeRecordingStartMock.mock.invocationCallOrder[0]!
  );
  expect(scheduleRecordingStartActivationWatchdogMock).not.toHaveBeenCalled();
  acceptOffscreenStart('stream-instance-1');
  await start;

  expect(issuePreparedVideoRecordingLeaseMock).toHaveBeenCalledWith({
    captureMode: CaptureMode.TAB,
    cropRegion: null,
    ownerSenderUrl,
    surfaceBinding: { generation: 1, streamInstanceId: 'recording-1' },
    viewportPresetId: undefined,
  });
  expect(finalizeRecordingStartMock).toHaveBeenCalledTimes(1);
  expect(beginPreparedRecordingMock).toHaveBeenCalledWith({
    generation: 1,
    recordingId: 'recording-1',
    streamInstanceId: 'recording-1',
  });
  expect(scheduleRecordingStartActivationWatchdogMock).toHaveBeenCalledWith('recording-1');
});

it('fails before beginning the prepared recording when its control lease cannot be issued', async () => {
  issuePreparedVideoRecordingLeaseMock.mockResolvedValueOnce(null);
  const ownerSenderUrl = 'chrome-extension://test/apps/extension/src/popup/index.html';

  await expect(
    startRecording(17, settings, CaptureMode.TAB, undefined, ownerSenderUrl)
  ).resolves.toEqual({
    error: 'Failed to issue recording control capability',
    result: 'failed',
  });

  expect(finalizeRecordingStartMock).not.toHaveBeenCalled();
  expect(beginPreparedRecordingMock).not.toHaveBeenCalled();
  expect(scheduleRecordingStartActivationWatchdogMock).not.toHaveBeenCalled();
  expect(notifyRecordingStartFailedMock).toHaveBeenCalledWith(
    'Failed to issue recording control capability',
    { retainAuthority: false }
  );
});

it('retains start authority when identity-bound delivery cleanup is not acknowledged', async () => {
  beginPreparedRecordingMock.mockRejectedValueOnce(new Error('offscreen failed'));
  sendRuntimeMessageMock.mockRejectedValueOnce(new Error('offscreen cleanup failed'));
  const ownerSenderUrl = 'chrome-extension://test/apps/extension/src/popup/index.html';

  await expect(
    startRecording(17, settings, CaptureMode.TAB, undefined, ownerSenderUrl)
  ).resolves.toEqual({
    error: 'Recording start failed and identity-bound offscreen cleanup was not acknowledged',
    result: 'failed',
  });

  expect(scheduleRecordingStartActivationWatchdogMock).not.toHaveBeenCalled();
  expect(clearActiveVideoRecordingLeaseMock).not.toHaveBeenCalled();
  expect(sendRuntimeMessageMock).toHaveBeenCalledWith(
    expect.objectContaining({
      type: VideoMessageType.OFFSCREEN_STOP_RECORDING,
      capabilityToken: expect.any(String),
      discard: true,
    })
  );
  expect(notifyRecordingStartFailedMock).toHaveBeenCalledWith(
    'Recording start failed and identity-bound offscreen cleanup was not acknowledged',
    { retainAuthority: true }
  );
});

it('retains start authority when the bound source stops but durable lease cleanup fails', async () => {
  beginPreparedRecordingMock.mockRejectedValueOnce(new Error('offscreen failed'));
  clearActiveVideoRecordingLeaseMock.mockRejectedValueOnce(new Error('lease cleanup failed'));
  const ownerSenderUrl = 'chrome-extension://test/apps/extension/src/popup/index.html';

  await expect(
    startRecording(17, settings, CaptureMode.TAB, undefined, ownerSenderUrl)
  ).resolves.toEqual({
    error: 'Recording start failed and identity-bound offscreen cleanup was not acknowledged',
    result: 'failed',
  });

  expect(clearActiveVideoRecordingLeaseMock).toHaveBeenCalledWith('recording-1');
  expect(notifyRecordingStartFailedMock).toHaveBeenCalledWith(
    'Recording start failed and identity-bound offscreen cleanup was not acknowledged',
    { retainAuthority: true }
  );
});

it('rolls back and cleans up when raw source validation times out', async () => {
  finalizeRecordingStartMock.mockRejectedValueOnce(
    new Error('Timed out while validating the recording source')
  );
  const ownerSenderUrl = 'chrome-extension://test/apps/extension/src/popup/index.html';

  const result = await startRecording(17, settings, CaptureMode.TAB, undefined, ownerSenderUrl);

  expect(result).toEqual({
    error: 'Timed out while validating the recording source',
    result: 'failed',
  });
  expect(issuePreparedVideoRecordingLeaseMock).toHaveBeenCalledWith({
    captureMode: CaptureMode.TAB,
    cropRegion: null,
    ownerSenderUrl,
    surfaceBinding: { generation: 1, streamInstanceId: 'recording-1' },
    viewportPresetId: undefined,
  });
  expect(scheduleRecordingStartActivationWatchdogMock).not.toHaveBeenCalled();
  expect(releaseVideoCaptureSurfaceMock).toHaveBeenCalledWith('recording-1');
  expect(sendRuntimeMessageMock).toHaveBeenCalledWith(
    expect.objectContaining({
      type: VideoMessageType.OFFSCREEN_STOP_RECORDING,
      capabilityToken: expect.any(String),
      discard: true,
    })
  );
  if (result.result !== 'failed') {
    throw new Error('Expected recording start to fail after source validation timeout');
  }
  expect(notifyRecordingStartFailedMock).toHaveBeenCalledWith(result.error, {
    retainAuthority: false,
  });
});

it('stringifies non-Error preparation failures before notifying the runtime', async () => {
  initializeRecordingContextMock.mockRejectedValue('capture blocked');
  const ownerSenderUrl = 'chrome-extension://test/apps/extension/src/popup/index.html';

  await startRecording(17, settings, CaptureMode.TAB, undefined, ownerSenderUrl);

  expect(notifyRecordingStartFailedMock).toHaveBeenCalledWith('capture blocked', {
    retainAuthority: false,
  });
});
