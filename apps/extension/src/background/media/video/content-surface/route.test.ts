import { beforeEach, expect, it, vi } from 'vitest';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { contentActionRuntimeContracts } from '../../../../contracts/messaging/contracts/runtime/actions/content-action';

const mocks = vi.hoisted(() => ({
  openPopup: vi.fn(),
  cancelRecordingStart: vi.fn(),
  ensureHeadroom: vi.fn(),
  ensureOffscreenDocument: vi.fn(),
  ensurePageAccess: vi.fn(),
  loadSettings: vi.fn(),
  loadVideoSettings: vi.fn(),
  loadVideoUiState: vi.fn(),
  mutateVideoSettings: vi.fn(),
  patchVideoSettings: vi.fn(),
  pauseRecording: vi.fn(),
  resolvePreset: vi.fn(),
  resumeRecording: vi.fn(),
  sendRuntimeMessage: vi.fn(),
  startRecording: vi.fn(),
  stopRecording: vi.fn(),
  waitForOffscreenReady: vi.fn(),
  updateRecordingSettings: vi.fn(),
  getTab: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/action', () => ({
  browserAction: { openPopup: mocks.openPopup },
}));
vi.mock('@sniptale/platform/browser/tabs', () => ({
  browserTabs: { get: mocks.getTab },
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), error: vi.fn(), log: vi.fn(), warn: vi.fn() }),
}));
vi.mock('@sniptale/platform/security/offscreen-command-capability', () => ({
  attachOffscreenCommandCapability: (message: unknown) => message,
}));
vi.mock('../../../../composition/persistence/infrastructure/browser-storage', () => ({
  browserStorage: {
    session: {
      get: vi.fn().mockResolvedValue({}),
      isAvailable: () => false,
      remove: vi.fn(),
      set: vi.fn(),
    },
  },
}));
vi.mock('../../../../composition/persistence/capture-settings', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../../composition/persistence/capture-settings')
  >()),
  loadVideoSettings: mocks.loadVideoSettings,
  loadVideoUiState: mocks.loadVideoUiState,
  mutateVideoSettings: mocks.mutateVideoSettings,
  patchVideoSettings: mocks.patchVideoSettings,
}));
vi.mock('../../../../composition/persistence/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../composition/persistence/settings')>()),
  loadSettings: mocks.loadSettings,
}));
vi.mock('../../../../features/media-hub/storage-capacity', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../features/media-hub/storage-capacity')>()),
  ensureMediaHubStorageHeadroom: mocks.ensureHeadroom,
}));
vi.mock('../../../page-access/service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../page-access/service')>()),
  ensureActivePageAccessRuntime: mocks.ensurePageAccess,
}));
vi.mock('../manager', () => ({ startRecording: mocks.startRecording }));
vi.mock('../runtime/manager/controls', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../runtime/manager/controls')>()),
  cancelRecordingStart: mocks.cancelRecordingStart,
  pauseRecording: mocks.pauseRecording,
  resumeRecording: mocks.resumeRecording,
  stopRecording: mocks.stopRecording,
  updateRecordingSettings: mocks.updateRecordingSettings,
}));
vi.mock('./preset', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./preset')>()),
  resolveVideoRecordingViewportPreset: mocks.resolvePreset,
}));
vi.mock('../../../routing-contracts/runtime-messaging/services', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../routing-contracts/runtime-messaging/services')
  >()),
  getBackgroundRuntimeMessaging: () => ({ sendRuntimeMessage: mocks.sendRuntimeMessage }),
}));
vi.mock('../../../offscreen-document/service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../offscreen-document/service')>()),
  ensureOffscreenDocument: mocks.ensureOffscreenDocument,
  waitForOffscreenReady: mocks.waitForOffscreenReady,
}));

import { routeVideoRecordingSurfaceMessage } from './route';
import {
  closeVideoRecordingCameraPeerForLease,
  recoverPendingVideoRecordingCameraPeerCleanup,
  resetVideoRecordingCameraPeerRetryForTests,
} from './camera-peer';
import {
  listPendingVideoRecordingCameraPeerCleanup,
  resetVideoRecordingCameraPeerCleanupForTests,
} from './camera-peer-cleanup';
import { runVideoRecordingSurfaceCommand } from './commands';
import {
  beginVideoRecordingSurfaceRebind,
  ensureVideoRecordingSurfaceLeaseHydrated,
  requestVideoRecordingSurface,
  resetVideoRecordingSurfaceLeaseForTests,
} from './surface-lease';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  vi.clearAllMocks();
  resetVideoRecordingCameraPeerCleanupForTests();
  resetVideoRecordingCameraPeerRetryForTests();
  resetVideoRecordingSurfaceLeaseForTests();
  mocks.ensureHeadroom.mockResolvedValue(undefined);
  mocks.getTab.mockResolvedValue({ active: true, windowId: 7 });
  mocks.openPopup.mockResolvedValue(undefined);
  mocks.ensureOffscreenDocument.mockResolvedValue(false);
  mocks.waitForOffscreenReady.mockResolvedValue(undefined);
  mocks.ensurePageAccess.mockResolvedValue(undefined);
  mocks.loadSettings.mockResolvedValue({ viewportPresets: [] });
  mocks.loadVideoSettings.mockResolvedValue(DEFAULT_VIDEO_SETTINGS);
  mocks.loadVideoUiState.mockResolvedValue({
    captureMode: CaptureMode.SCREEN,
    viewportPresetId: 'preset-1',
  });
  mocks.patchVideoSettings.mockResolvedValue(DEFAULT_VIDEO_SETTINGS);
  mocks.mutateVideoSettings.mockImplementation(async (mutation) =>
    mutation(DEFAULT_VIDEO_SETTINGS)
  );
  mocks.cancelRecordingStart.mockResolvedValue({ result: 'cancelled-before-active' });
  mocks.pauseRecording.mockResolvedValue({ result: 'accepted' });
  mocks.resumeRecording.mockResolvedValue({ result: 'accepted' });
  mocks.stopRecording.mockResolvedValue({ result: 'accepted' });
  mocks.updateRecordingSettings.mockResolvedValue({ result: 'accepted' });
  mocks.resolvePreset.mockResolvedValue('preset-1');
  mocks.sendRuntimeMessage.mockResolvedValue({ success: true, result: 'accepted' });
});

it('starts only a saved TAB recording and returns a surface token', async () => {
  mocks.startRecording.mockResolvedValue({ result: 'accepted', recordingId: 'recording-1' });
  const sendResponse = vi.fn();

  routeVideoRecordingSurfaceMessage({
    message: {
      type: VideoMessageType.START_SAVED_TAB_VIDEO_RECORDING,
      contentIntent: { requestId: 'request-1', token: 'intent-1' },
    },
    resolvedTabId: 12,
    sendResponse,
    sender: { url: 'https://example.test/page' },
  });
  await flush();

  expect(mocks.startRecording).toHaveBeenCalledWith(
    12,
    DEFAULT_VIDEO_SETTINGS,
    CaptureMode.TAB,
    'preset-1',
    'https://example.test/page'
  );
  expect(sendResponse).toHaveBeenCalledWith(
    expect.objectContaining({
      success: true,
      surfaceSessionId: expect.any(String),
      surfaceToken: expect.any(String),
    })
  );
  expect(sendResponse.mock.calls[0]?.[0]).not.toHaveProperty('controlToken');
  expect(
    contentActionRuntimeContracts[VideoMessageType.START_SAVED_TAB_VIDEO_RECORDING].parseResponse(
      sendResponse.mock.calls[0]?.[0]
    )
  ).toEqual(sendResponse.mock.calls[0]?.[0]);
});

it('preserves manual surface authority while start is pending so cancel-start remains valid', async () => {
  const lease = await requestVideoRecordingSurface({ entry: 'manual', tabId: 12 });
  let resolveStart!: (value: { result: 'accepted'; recordingId: string }) => void;
  mocks.startRecording.mockImplementationOnce(
    () => new Promise((resolve) => (resolveStart = resolve))
  );
  const started = vi.fn();
  routeVideoRecordingSurfaceMessage({
    message: {
      type: VideoMessageType.START_SAVED_TAB_VIDEO_RECORDING,
      contentIntent: { requestId: 'request-1', token: 'intent-1' },
    },
    resolvedTabId: 12,
    sendResponse: started,
    sender: { url: 'https://example.test/page' },
  });
  await vi.waitFor(() => expect(mocks.startRecording).toHaveBeenCalledOnce());

  await expect(
    runVideoRecordingSurfaceCommand(12, {
      type: VideoMessageType.VIDEO_RECORDING_SURFACE_COMMAND,
      surfaceSessionId: lease.surfaceSessionId,
      surfaceToken: lease.surfaceToken,
      capabilityEpoch: lease.capabilityEpoch,
      documentGeneration: lease.documentGeneration,
      recordingId: null,
      command: { kind: 'cancel-start' },
    })
  ).resolves.toEqual(expect.objectContaining({ success: true }));
  resolveStart({ result: 'accepted', recordingId: 'recording-1' });
  await flush();
  expect(started).toHaveBeenCalledWith(
    expect.objectContaining({ success: true, surfaceToken: lease.surfaceToken })
  );
});

it('rejects stale document commands before invoking recording controls', async () => {
  const lease = await requestVideoRecordingSurface({
    entry: 'manual',
    recordingId: 'recording-1',
    tabId: 12,
  });
  const sendResponse = vi.fn();

  routeVideoRecordingSurfaceMessage({
    message: {
      type: VideoMessageType.VIDEO_RECORDING_SURFACE_COMMAND,
      surfaceSessionId: lease.surfaceSessionId,
      surfaceToken: lease.surfaceToken,
      capabilityEpoch: lease.capabilityEpoch,
      documentGeneration: lease.documentGeneration + 1,
      recordingId: 'recording-1',
      command: { kind: 'pause' },
    },
    resolvedTabId: 12,
    sendResponse,
    sender: { url: 'https://example.test/page' },
  });
  await flush();

  expect(sendResponse).toHaveBeenCalledWith(
    expect.objectContaining({ success: false, error: expect.stringContaining('stale') })
  );
});

it('rejects a camera offer from the document generation invalidated by navigation', async () => {
  const lease = await requestVideoRecordingSurface({ entry: 'manual', tabId: 12 });
  await beginVideoRecordingSurfaceRebind(12);
  const sendResponse = vi.fn();

  routeVideoRecordingSurfaceMessage({
    message: {
      type: VideoMessageType.VIDEO_RECORDING_CAMERA_OFFER,
      surfaceSessionId: lease.surfaceSessionId,
      surfaceToken: lease.surfaceToken,
      documentGeneration: lease.documentGeneration,
      peerGeneration: lease.peerGeneration,
      sdp: 'stale-offer',
    },
    resolvedTabId: 12,
    sendResponse,
    sender: { url: 'https://example.test/page' },
  });
  await flush();

  expect(mocks.sendRuntimeMessage).not.toHaveBeenCalled();
  expect(sendResponse).toHaveBeenCalledWith(
    expect.objectContaining({ success: false, error: expect.stringContaining('stale') })
  );
});

it('revalidates an accepted camera offer after asynchronous peer creation', async () => {
  const lease = await requestVideoRecordingSurface({ entry: 'manual', tabId: 12 });
  let resolveOffer!: (value: unknown) => void;
  mocks.sendRuntimeMessage.mockImplementationOnce(
    () => new Promise((resolve) => (resolveOffer = resolve))
  );
  const sendResponse = vi.fn();
  routeVideoRecordingSurfaceMessage({
    message: {
      type: VideoMessageType.VIDEO_RECORDING_CAMERA_OFFER,
      surfaceSessionId: lease.surfaceSessionId,
      surfaceToken: lease.surfaceToken,
      documentGeneration: lease.documentGeneration,
      peerGeneration: lease.peerGeneration,
      sdp: 'offer-sdp',
    },
    resolvedTabId: 12,
    sendResponse,
    sender: { url: 'https://example.test/page' },
  });
  await vi.waitFor(() => expect(mocks.sendRuntimeMessage).toHaveBeenCalledOnce());
  await beginVideoRecordingSurfaceRebind(12);
  resolveOffer({ success: true, sdp: 'answer-sdp' });
  await flush();
  expect(sendResponse).toHaveBeenCalledWith(
    expect.objectContaining({ success: false, error: expect.stringContaining('stale') })
  );
  expect(mocks.sendRuntimeMessage).toHaveBeenLastCalledWith(
    expect.objectContaining({ type: VideoMessageType.OFFSCREEN_VIDEO_RECORDING_CAMERA_CLOSE })
  );
});

it('surfaces rejected recording controls and rolls back failed durable device commits', async () => {
  const lease = await requestVideoRecordingSurface({
    entry: 'manual',
    recordingId: 'recording-1',
    tabId: 12,
  });
  const base = {
    type: VideoMessageType.VIDEO_RECORDING_SURFACE_COMMAND,
    surfaceSessionId: lease.surfaceSessionId,
    surfaceToken: lease.surfaceToken,
    capabilityEpoch: lease.capabilityEpoch,
    documentGeneration: lease.documentGeneration,
    recordingId: 'recording-1',
  } as const;
  mocks.pauseRecording.mockResolvedValueOnce({ result: 'blocked' });
  await expect(
    runVideoRecordingSurfaceCommand(12, { ...base, command: { kind: 'pause' } })
  ).rejects.toThrow('not accepted');

  mocks.patchVideoSettings.mockRejectedValueOnce(new Error('storage failed'));
  await expect(
    runVideoRecordingSurfaceCommand(12, {
      ...base,
      command: { kind: 'select-webcam-device', deviceId: 'cam-2' },
    })
  ).rejects.toThrow('storage failed');
  expect(mocks.updateRecordingSettings).toHaveBeenNthCalledWith(1, {
    webcamDeviceId: 'cam-2',
  });
  expect(mocks.updateRecordingSettings).toHaveBeenNthCalledWith(2, {
    webcamDeviceId: DEFAULT_VIDEO_SETTINGS.webcamDeviceId ?? null,
  });
});

it('marks the surface degraded when a durable failure cannot restore live media', async () => {
  const lease = await requestVideoRecordingSurface({
    entry: 'manual',
    recordingId: 'recording-1',
    tabId: 12,
  });
  const rollbackError = { error: 'rollback rejected', result: 'failed' } as const;
  const storageError = new Error('storage failed');
  mocks.updateRecordingSettings
    .mockResolvedValueOnce({ result: 'accepted' })
    .mockResolvedValueOnce(rollbackError);
  mocks.patchVideoSettings.mockRejectedValueOnce(storageError);

  const commandPromise = runVideoRecordingSurfaceCommand(12, {
    type: VideoMessageType.VIDEO_RECORDING_SURFACE_COMMAND,
    surfaceSessionId: lease.surfaceSessionId,
    surfaceToken: lease.surfaceToken,
    capabilityEpoch: lease.capabilityEpoch,
    documentGeneration: lease.documentGeneration,
    recordingId: 'recording-1',
    command: { kind: 'select-webcam-device', deviceId: 'cam-2' },
  });
  await expect(commandPromise).rejects.toMatchObject({
    cause: expect.objectContaining({ message: 'rollback rejected' }),
    errors: [storageError, expect.objectContaining({ message: 'rollback rejected' })],
    message: expect.stringMatching(
      /Durable settings update failed: storage failed; live rollback was not accepted: rollback rejected/u
    ),
  });
  expect((await import('./surface-lease')).getVideoRecordingSurfaceLeaseSnapshot()).toMatchObject({
    lifecycle: 'degraded',
  });
});

it('rejects explicit offscreen camera close failures', async () => {
  const lease = await requestVideoRecordingSurface({ entry: 'manual', tabId: 12 });
  mocks.sendRuntimeMessage.mockResolvedValueOnce({ success: false, error: 'close failed' });
  await expect(closeVideoRecordingCameraPeerForLease(lease)).rejects.toThrow('close failed');
  await expect(listPendingVideoRecordingCameraPeerCleanup()).resolves.toEqual([
    `${lease.surfaceSessionId}:0:0`,
  ]);

  mocks.sendRuntimeMessage.mockResolvedValue({ success: true, result: 'closed' });
  await expect(recoverPendingVideoRecordingCameraPeerCleanup()).resolves.toBe(true);
  await expect(listPendingVideoRecordingCameraPeerCleanup()).resolves.toEqual([]);
});

it('activates and releases the manual surface with matching authority', async () => {
  const activated = vi.fn();
  routeVideoRecordingSurfaceMessage({
    message: {
      type: VideoMessageType.ACTIVATE_VIDEO_RECORDING_SURFACE,
      contentIntent: { requestId: 'request-1', token: 'intent-1' },
    },
    resolvedTabId: 12,
    sendResponse: activated,
    sender: { url: 'https://example.test/page' },
  });
  await flush();
  const response = activated.mock.calls[0]?.[0];
  expect(response).toEqual(expect.objectContaining({ success: true }));

  const released = vi.fn();
  routeVideoRecordingSurfaceMessage({
    message: {
      type: VideoMessageType.RELEASE_VIDEO_RECORDING_SURFACE,
      surfaceSessionId: response.surfaceSessionId,
      surfaceToken: response.surfaceToken,
    },
    resolvedTabId: 12,
    sendResponse: released,
    sender: { url: 'https://example.test/page' },
  });
  await flush();
  expect(released).toHaveBeenCalledWith({ success: true, result: 'released' });
});

it('restores toolbar persistence when a hidden active surface is manually reopened', async () => {
  const hidden = await requestVideoRecordingSurface({
    entry: 'manual',
    recordingId: 'recording-1',
    tabId: 12,
    toolbarRequested: false,
  });
  const activated = vi.fn();
  routeVideoRecordingSurfaceMessage({
    message: {
      type: VideoMessageType.ACTIVATE_VIDEO_RECORDING_SURFACE,
      contentIntent: { requestId: 'request-reopen', token: 'intent-reopen' },
    },
    resolvedTabId: 12,
    sendResponse: activated,
    sender: { url: 'https://example.test/page' },
  });
  await flush();

  expect(activated).toHaveBeenCalledWith(
    expect.objectContaining({
      snapshot: expect.objectContaining({ toolbarRequested: true }),
      success: true,
      surfaceSessionId: hidden.surfaceSessionId,
    })
  );
  await expect(ensureVideoRecordingSurfaceLeaseHydrated()).resolves.toEqual(
    expect.objectContaining({ toolbarRequested: true })
  );
});

it('routes valid camera offer and close commands through the stable offscreen peer', async () => {
  const lease = await requestVideoRecordingSurface({ entry: 'manual', tabId: 12 });
  mocks.sendRuntimeMessage
    .mockResolvedValueOnce({ success: true, sdp: 'answer-sdp' })
    .mockResolvedValue({ success: true });
  const offerResponse = vi.fn();
  routeVideoRecordingSurfaceMessage({
    message: {
      type: VideoMessageType.VIDEO_RECORDING_CAMERA_OFFER,
      surfaceSessionId: lease.surfaceSessionId,
      surfaceToken: lease.surfaceToken,
      documentGeneration: lease.documentGeneration,
      peerGeneration: lease.peerGeneration,
      sdp: 'offer-sdp',
    },
    resolvedTabId: 12,
    sendResponse: offerResponse,
    sender: { url: 'https://example.test/page' },
  });
  await flush();
  expect(offerResponse).toHaveBeenCalledWith({ success: true, sdp: 'answer-sdp' });

  const closeResponse = vi.fn();
  routeVideoRecordingSurfaceMessage({
    message: {
      type: VideoMessageType.VIDEO_RECORDING_CAMERA_CLOSE,
      surfaceSessionId: lease.surfaceSessionId,
      surfaceToken: lease.surfaceToken,
      documentGeneration: lease.documentGeneration,
      peerGeneration: lease.peerGeneration,
    },
    resolvedTabId: 12,
    sendResponse: closeResponse,
    sender: { url: 'https://example.test/page' },
  });
  await flush();
  expect(closeResponse).toHaveBeenCalledWith({ success: true, result: 'closed' });
  await closeVideoRecordingCameraPeerForLease(lease);
  expect(mocks.sendRuntimeMessage).toHaveBeenLastCalledWith(
    expect.objectContaining({
      type: VideoMessageType.OFFSCREEN_VIDEO_RECORDING_CAMERA_CLOSE,
      peerId: `${lease.surfaceSessionId}:0:0`,
    })
  );
});

it('executes lifecycle and live media surface commands for an active recording', async () => {
  const lease = await requestVideoRecordingSurface({
    entry: 'manual',
    recordingId: 'recording-1',
    tabId: 12,
  });
  const command = async (value: Parameters<typeof runVideoRecordingSurfaceCommand>[1]['command']) =>
    runVideoRecordingSurfaceCommand(12, {
      type: VideoMessageType.VIDEO_RECORDING_SURFACE_COMMAND,
      surfaceSessionId: lease.surfaceSessionId,
      surfaceToken: lease.surfaceToken,
      capabilityEpoch: lease.capabilityEpoch,
      documentGeneration: lease.documentGeneration,
      recordingId: 'recording-1',
      command: value,
    });

  await command({ kind: 'cancel-start' });
  await command({ kind: 'pause' });
  await command({ kind: 'resume' });
  await command({ kind: 'stop' });
  await command({ kind: 'set-microphone-enabled', enabled: false });
  const enabledCamera = await command({ kind: 'set-webcam-enabled', enabled: true });
  expect(enabledCamera.snapshot.peerGeneration).toBe(lease.peerGeneration + 1);
  await command({ kind: 'select-microphone-device', deviceId: 'mic-2' });
  const switchedCamera = await command({ kind: 'select-webcam-device', deviceId: 'cam-2' });
  expect(switchedCamera.snapshot.peerGeneration).toBe(lease.peerGeneration + 1);
  const hidden = await command({ kind: 'set-toolbar-requested', enabled: false });
  expect(hidden.snapshot.toolbarRequested).toBe(false);
  await command({ kind: 'set-auto-fade-delay', delay: 5 });
  await command({
    kind: 'set-spotlight-settings',
    cursorHaloEnabled: true,
    cursorDimmingEnabled: false,
    clickAnimationEnabled: true,
  });
  await command({
    kind: 'update-embedded-camera',
    appearance: DEFAULT_VIDEO_SETTINGS.webcamPresentation!,
  });

  expect(mocks.cancelRecordingStart).toHaveBeenCalledOnce();
  expect(mocks.pauseRecording).toHaveBeenCalledOnce();
  expect(mocks.resumeRecording).toHaveBeenCalledOnce();
  expect(mocks.stopRecording).toHaveBeenCalledWith(false);
  expect(mocks.patchVideoSettings).toHaveBeenCalledTimes(6);
  expect(mocks.mutateVideoSettings).toHaveBeenCalledOnce();
  const spotlightMutation = mocks.mutateVideoSettings.mock.calls[0]?.[0];
  expect(
    spotlightMutation({
      ...DEFAULT_VIDEO_SETTINGS,
      recordingSurface: {
        toolbarEnabled: false,
        cursorSpotlightEnabled: false,
        cursorDimmingEnabled: true,
        cursorClickAnimationEnabled: false,
      },
    }).recordingSurface
  ).toEqual({
    toolbarEnabled: false,
    cursorSpotlightEnabled: true,
    cursorDimmingEnabled: false,
    cursorClickAnimationEnabled: true,
  });
  expect(mocks.updateRecordingSettings).toHaveBeenCalledTimes(4);
});

it('allows idle settings but rejects idle lifecycle commands', async () => {
  const lease = await requestVideoRecordingSurface({ entry: 'manual', tabId: 12 });
  const base = {
    type: VideoMessageType.VIDEO_RECORDING_SURFACE_COMMAND,
    surfaceSessionId: lease.surfaceSessionId,
    surfaceToken: lease.surfaceToken,
    capabilityEpoch: lease.capabilityEpoch,
    documentGeneration: lease.documentGeneration,
    recordingId: null,
  } as const;
  await expect(
    runVideoRecordingSurfaceCommand(12, {
      ...base,
      command: { kind: 'set-webcam-enabled', enabled: true },
    })
  ).resolves.toEqual(expect.objectContaining({ success: true }));
  const switchedCamera = await runVideoRecordingSurfaceCommand(12, {
    ...base,
    command: { kind: 'select-webcam-device', deviceId: 'cam-2' },
  });
  expect(switchedCamera.snapshot).toMatchObject({
    peerGeneration: lease.peerGeneration + 1,
  });
  expect(mocks.sendRuntimeMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      type: VideoMessageType.OFFSCREEN_VIDEO_RECORDING_CAMERA_SWITCH,
      deviceId: 'cam-2',
    })
  );
  expect(mocks.updateRecordingSettings).not.toHaveBeenCalled();
  await runVideoRecordingSurfaceCommand(12, {
    ...base,
    command: { kind: 'select-microphone-device', deviceId: 'mic-2' },
  });
  expect(mocks.patchVideoSettings).toHaveBeenCalledWith({ microphoneDeviceId: 'mic-2' });
  expect(mocks.updateRecordingSettings).not.toHaveBeenCalled();
  await expect(
    runVideoRecordingSurfaceCommand(12, { ...base, command: { kind: 'pause' } })
  ).rejects.toThrow('require an active recording');
});

it('rolls an idle preview back when its selected camera cannot be persisted', async () => {
  const lease = await requestVideoRecordingSurface({ entry: 'manual', tabId: 12 });
  mocks.patchVideoSettings.mockRejectedValueOnce(new Error('storage failed'));

  await expect(
    runVideoRecordingSurfaceCommand(12, {
      type: VideoMessageType.VIDEO_RECORDING_SURFACE_COMMAND,
      surfaceSessionId: lease.surfaceSessionId,
      surfaceToken: lease.surfaceToken,
      capabilityEpoch: lease.capabilityEpoch,
      documentGeneration: lease.documentGeneration,
      recordingId: null,
      command: { kind: 'select-webcam-device', deviceId: 'cam-2' },
    })
  ).rejects.toThrow('storage failed');

  expect(mocks.sendRuntimeMessage).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({
      type: VideoMessageType.OFFSCREEN_VIDEO_RECORDING_CAMERA_SWITCH,
      deviceId: 'cam-2',
    })
  );
  expect(mocks.sendRuntimeMessage).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({
      type: VideoMessageType.OFFSCREEN_VIDEO_RECORDING_CAMERA_SWITCH,
      deviceId: DEFAULT_VIDEO_SETTINGS.webcamDeviceId ?? null,
    })
  );
});

it('rejects and rolls back an idle camera switch invalidated by document rebind', async () => {
  const lease = await requestVideoRecordingSurface({ entry: 'manual', tabId: 12 });
  let resolveSwitch!: (value: { success: true; result: 'accepted' }) => void;
  mocks.sendRuntimeMessage.mockImplementationOnce(
    () =>
      new Promise<{ success: true; result: 'accepted' }>((resolve) => {
        resolveSwitch = resolve;
      })
  );
  const switching = runVideoRecordingSurfaceCommand(12, {
    type: VideoMessageType.VIDEO_RECORDING_SURFACE_COMMAND,
    surfaceSessionId: lease.surfaceSessionId,
    surfaceToken: lease.surfaceToken,
    capabilityEpoch: lease.capabilityEpoch,
    documentGeneration: lease.documentGeneration,
    recordingId: null,
    command: { kind: 'select-webcam-device', deviceId: 'cam-2' },
  });
  await vi.waitFor(() => expect(resolveSwitch).toBeTypeOf('function'));

  await beginVideoRecordingSurfaceRebind(12);
  resolveSwitch({ success: true, result: 'accepted' });

  await expect(switching).rejects.toThrow('Unauthorized or stale');
  expect(mocks.patchVideoSettings).not.toHaveBeenCalled();
  expect(mocks.sendRuntimeMessage).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({
      type: VideoMessageType.OFFSCREEN_VIDEO_RECORDING_CAMERA_SWITCH,
      deviceId: DEFAULT_VIDEO_SETTINGS.webcamDeviceId ?? null,
    })
  );
});

it('rejects toolbar visibility commands with a mismatched recording binding', async () => {
  const lease = await requestVideoRecordingSurface({
    entry: 'manual',
    recordingId: 'recording-1',
    tabId: 12,
  });
  await expect(
    runVideoRecordingSurfaceCommand(12, {
      type: VideoMessageType.VIDEO_RECORDING_SURFACE_COMMAND,
      surfaceSessionId: lease.surfaceSessionId,
      surfaceToken: lease.surfaceToken,
      capabilityEpoch: lease.capabilityEpoch,
      documentGeneration: lease.documentGeneration,
      recordingId: null,
      command: { kind: 'set-toolbar-requested', enabled: false },
    })
  ).rejects.toThrow('Unauthorized or stale');
});

it('surfaces unavailable presets, failed starts, and missing sender authority', async () => {
  await expect(routeStartWithoutSender()).resolves.toEqual(
    expect.objectContaining({ success: false })
  );

  mocks.resolvePreset.mockResolvedValueOnce(null);
  const unavailable = vi.fn();
  routeVideoRecordingSurfaceMessage({
    message: {
      type: VideoMessageType.START_SAVED_TAB_VIDEO_RECORDING,
      contentIntent: { requestId: 'request-2', token: 'intent-2' },
    },
    resolvedTabId: 12,
    sendResponse: unavailable,
    sender: { url: 'https://example.test/page' },
  });
  await flush();
  expect(unavailable).toHaveBeenCalledWith(
    expect.objectContaining({ success: false, error: expect.stringContaining('preset') })
  );

  mocks.resolvePreset.mockResolvedValueOnce('preset-1');
  mocks.startRecording.mockResolvedValueOnce({ result: 'failed', error: 'capture failed' });
  const failed = vi.fn();
  routeVideoRecordingSurfaceMessage({
    message: {
      type: VideoMessageType.START_SAVED_TAB_VIDEO_RECORDING,
      contentIntent: { requestId: 'request-3', token: 'intent-3' },
    },
    resolvedTabId: 12,
    sendResponse: failed,
    sender: { url: 'https://example.test/page' },
  });
  await flush();
  expect(failed).toHaveBeenCalledWith(
    expect.objectContaining({ success: false, error: 'capture failed' })
  );
});

it('opens the video popup when a previous recording must be resolved', async () => {
  mocks.startRecording.mockResolvedValueOnce({
    error: 'Resolve the previous recording before starting another.',
    result: 'failed',
  });

  const response = await routeStartWithoutSender('https://example.test/page');

  expect(response).toEqual(
    expect.objectContaining({
      error: 'Resolve the previous recording before starting another.',
      success: false,
    })
  );
  expect(mocks.openPopup).toHaveBeenCalledWith({ windowId: 7 });
});

async function routeStartWithoutSender(senderUrl?: string) {
  const response = vi.fn();
  routeVideoRecordingSurfaceMessage({
    message: {
      type: VideoMessageType.START_SAVED_TAB_VIDEO_RECORDING,
      contentIntent: { requestId: 'request-0', token: 'intent-0' },
    },
    resolvedTabId: 12,
    sendResponse: response,
    sender: senderUrl ? { url: senderUrl } : undefined,
  });
  await flush();
  return response.mock.calls[0]?.[0];
}
