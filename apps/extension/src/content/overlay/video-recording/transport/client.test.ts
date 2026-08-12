import { beforeEach, expect, it, vi } from 'vitest';

const { sendRuntimeMessage, subscribeToMessages } = vi.hoisted(() => ({
  sendRuntimeMessage: vi.fn(),
  subscribeToMessages: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/runtime')>()),
  browserRuntime: { subscribeToMessages },
}));

vi.mock('../../../application/privileged-action-intent', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../application/privileged-action-intent')>()),
  attachContentActionIntent: vi.fn(async (message: object) => ({
    ...message,
    contentIntent: { requestId: 'request-1', token: 'intent-1' },
  })),
  createTrustedContentActionIntentSource: vi.fn(() => ({ kind: 'trusted-event' })),
}));

vi.mock('../../../application/runtime-services/services', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../application/runtime-services/services')>()),
  getContentRuntimeServices: () => ({ messaging: { sendRuntimeMessage } }),
}));

import {
  activateVideoRecordingSurface,
  closeVideoRecordingCameraPeer,
  releaseVideoRecordingSurface,
  requestVideoRecordingCameraAnswer,
  sendVideoRecordingSurfaceCommand,
  startSavedTabVideoRecording,
  subscribeToVideoRecordingRuntimeState,
  subscribeToVideoRecordingSurfaceSnapshots,
  type SurfaceIdentity,
} from './client';
import { VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';

const identity: SurfaceIdentity = {
  capabilityEpoch: 4,
  documentGeneration: 2,
  peerGeneration: 3,
  recordingId: null,
  surfaceSessionId: 'surface-1',
  surfaceToken: 'token-1',
};

beforeEach(() => vi.clearAllMocks());

it('sends idle settings through the surface-bound authority without forged capture settings', async () => {
  sendRuntimeMessage.mockResolvedValue({ success: true, result: 'updated' });

  await sendVideoRecordingSurfaceCommand(identity, {
    enabled: true,
    kind: 'set-webcam-enabled',
  });

  expect(sendRuntimeMessage).toHaveBeenCalledWith({
    type: 'VIDEO_RECORDING_SURFACE_COMMAND',
    capabilityEpoch: 4,
    command: { enabled: true, kind: 'set-webcam-enabled' },
    documentGeneration: 2,
    recordingId: null,
    surfaceSessionId: 'surface-1',
    surfaceToken: 'token-1',
  });
});

it('surfaces a rejected command instead of projecting an optimistic success', async () => {
  sendRuntimeMessage.mockResolvedValue({ success: false, error: 'stale surface' });

  await expect(
    sendVideoRecordingSurfaceCommand(identity, { enabled: true, kind: 'set-webcam-enabled' })
  ).rejects.toThrow('stale surface');
});

it('issues trusted manual activation and saved TAB start intents', async () => {
  sendRuntimeMessage.mockResolvedValue({ success: true });
  const event = new Event('click');
  await activateVideoRecordingSurface(event);
  await startSavedTabVideoRecording(event);
  expect(sendRuntimeMessage.mock.calls.map(([message]) => message.type)).toEqual([
    'ACTIVATE_VIDEO_RECORDING_SURFACE',
    'START_SAVED_TAB_VIDEO_RECORDING',
  ]);
  expect(sendRuntimeMessage.mock.calls[0]?.[0]).toHaveProperty('contentIntent.token', 'intent-1');
});

it('routes camera negotiation, close, and release with surface identity only', async () => {
  sendRuntimeMessage
    .mockResolvedValueOnce({ success: true, sdp: 'answer-sdp' })
    .mockResolvedValue({ success: true });
  await expect(requestVideoRecordingCameraAnswer(identity, 'offer-sdp')).resolves.toBe(
    'answer-sdp'
  );
  await closeVideoRecordingCameraPeer(identity);
  await releaseVideoRecordingSurface(identity);
  expect(sendRuntimeMessage).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({
      type: 'VIDEO_RECORDING_CAMERA_OFFER',
      peerGeneration: 3,
      sdp: 'offer-sdp',
    })
  );
  expect(sendRuntimeMessage).toHaveBeenNthCalledWith(
    3,
    expect.objectContaining({ type: 'RELEASE_VIDEO_RECORDING_SURFACE' })
  );
});

it('rejects malformed camera answers', async () => {
  sendRuntimeMessage.mockResolvedValue({ success: false, error: 'stale peer' });
  await expect(requestVideoRecordingCameraAnswer(identity, 'offer')).rejects.toThrow('stale peer');
});

it('retains caller authority when peer close or surface release is rejected', async () => {
  sendRuntimeMessage.mockResolvedValue({ success: false, error: 'cleanup rejected' });
  await expect(closeVideoRecordingCameraPeer(identity)).rejects.toThrow('cleanup rejected');
  await expect(releaseVideoRecordingSurface(identity)).rejects.toThrow('cleanup rejected');
});

it('projects validated surface and runtime subscriptions', () => {
  const listeners: Array<(message: unknown) => unknown> = [];
  subscribeToMessages.mockImplementation((listener: (message: unknown) => unknown) => {
    listeners.push(listener);
    return vi.fn();
  });
  Object.defineProperty(globalThis, 'chrome', {
    configurable: true,
    value: { runtime: { onMessage: {} } },
  });
  const surfaceListener = vi.fn();
  const runtimeListener = vi.fn();
  subscribeToVideoRecordingSurfaceSnapshots(surfaceListener);
  subscribeToVideoRecordingRuntimeState(runtimeListener);
  listeners[0]?.({ type: 'unrelated' });
  listeners[0]?.({
    type: 'VIDEO_RECORDING_SURFACE_SNAPSHOT',
    snapshot: {
      autoFadeDelay: 5,
      capabilityEpoch: 1,
      cursorSpotlightEnabled: true,
      documentGeneration: 0,
      duration: 0,
      entry: 'manual',
      errorCode: null,
      lifecycle: 'ready',
      microphoneDeviceId: null,
      microphoneEnabled: false,
      peerGeneration: 0,
      recordingId: null,
      status: VideoRecordingStatus.IDLE,
      surfaceSessionId: 'surface-1',
      toolbarRequested: true,
      webcamDeviceId: null,
      webcamEnabled: false,
      webcamPresentation: DEFAULT_VIDEO_SETTINGS.webcamPresentation!,
    },
    surfaceToken: 'token-1',
  });
  listeners[1]?.({ type: 'RECORDING_STATE_SYNC', state: { invalid: true } });
  listeners[1]?.({
    type: 'RECORDING_STATE_SYNC',
    state: {
      captureMode: null,
      captureSource: null,
      countdownEndsAt: null,
      duration: 0,
      error: null,
      status: VideoRecordingStatus.IDLE,
      viewportPresetId: null,
    },
  });
  expect(surfaceListener).toHaveBeenCalledWith(expect.any(Object), 'token-1');
  expect(runtimeListener).toHaveBeenCalledOnce();
  Reflect.deleteProperty(globalThis, 'chrome');
});
