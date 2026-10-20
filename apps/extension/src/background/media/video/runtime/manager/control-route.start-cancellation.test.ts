import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CaptureMode, VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';

const { sessionGet, sessionSet, runtimeState, restoreCameraDocument } = vi.hoisted(() => ({
  sessionGet: vi.fn(),
  sessionSet: vi.fn(),
  runtimeState: vi.fn(),
  restoreCameraDocument: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/runtime', async (original) => ({
  ...(await original<typeof import('@sniptale/platform/browser/runtime')>()),
  runtimeInfo: {
    getURL: (path: string) => `chrome-extension://test/${path}`,
  },
}));

vi.mock(
  '../../../../../composition/persistence/infrastructure/browser-storage',
  async (original) => ({
    ...(await original<
      typeof import('../../../../../composition/persistence/infrastructure/browser-storage')
    >()),
    browserStorage: {
      session: {
        get: sessionGet,
        set: sessionSet,
        remove: vi.fn(),
        isAvailable: () => true,
      },
    },
  })
);
vi.mock('../../session-state', async (original) => ({
  ...(await original<typeof import('../../session-state')>()),
  getVideoRecordingId: () => 'recording-1',
  getVideoRecordingTabId: () => 42,
}));
vi.mock('../session-state', async (original) => ({
  ...(await original<typeof import('../session-state')>()),
  getVideoRecordingRuntimeState: runtimeState,
}));
vi.mock('../../capture-surface/recovery', async (original) => ({
  ...(await original<typeof import('../../capture-surface/recovery')>()),
  waitForVideoCaptureSurfaceRecovery: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../camera-recorder-control', async (original) => ({
  ...(await original<typeof import('../camera-recorder-control')>()),
  restoreAuthorizedCameraRecorderDocument: restoreCameraDocument,
}));

import { runtimeInfo } from '@sniptale/platform/browser/runtime';
import {
  activateVideoRecordingLease,
  getActiveVideoRecordingLeaseSnapshot,
  hydrateVideoRecordingLeaseCache,
  issuePreparedVideoRecordingLease,
  resetActiveVideoRecordingLeaseForTests,
} from '../../recording-control-lease';
import { isAuthorizedRecordingControl } from './control-route.authorization';

const ownerSenderUrl = runtimeInfo.getURL('apps/extension/src/popup/index.html');
const capability = { controlToken: 'control-token-1', recordingId: 'recording-1' };
const popupSender = { url: ownerSenderUrl };

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-20T12:00:00Z'));
  vi.stubGlobal('crypto', { randomUUID: () => capability.controlToken });
  sessionGet.mockResolvedValue({});
  sessionSet.mockResolvedValue(undefined);
  runtimeState.mockReturnValue({ status: VideoRecordingStatus.PREPARING });
  restoreCameraDocument.mockResolvedValue(true);
  resetActiveVideoRecordingLeaseForTests();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function prepareLease(captureMode: CaptureMode = CaptureMode.TAB) {
  const lease = await issuePreparedVideoRecordingLease({ captureMode, ownerSenderUrl });
  if (!lease) throw new Error('Expected prepared recording lease');
  return lease;
}

function authorizeCancellation(
  overrides: Partial<typeof capability> = {},
  sender: chrome.runtime.MessageSender | undefined = popupSender
) {
  const sendResponse = vi.fn();
  return isAuthorizedRecordingControl({
    message: { type: VideoMessageType.CANCEL_RECORDING_START, ...capability, ...overrides },
    sender,
    sendResponse,
  }).then((authorized) => ({ authorized, sendResponse }));
}

it.each([CaptureMode.TAB, CaptureMode.SCREEN, CaptureMode.CAMERA])(
  'authorizes exact trusted popup cancellation of a real prepared %s lease',
  async (captureMode) => {
    await prepareLease(captureMode);
    for (const status of [VideoRecordingStatus.PREPARING, VideoRecordingStatus.COUNTDOWN]) {
      runtimeState.mockReturnValue({ status });
      const result = await authorizeCancellation();
      expect(result.authorized).toBe(true);
      expect(result.sendResponse).not.toHaveBeenCalled();
    }
  }
);

it('refuses mismatched and non-popup prepared cancellation capabilities', async () => {
  await prepareLease();
  const attempts = [
    authorizeCancellation({ controlToken: 'wrong-token' }),
    authorizeCancellation({ recordingId: 'wrong-recording' }),
    authorizeCancellation({}, { url: 'https://example.com/' }),
    authorizeCancellation(
      {},
      {
        url: runtimeInfo.getURL('apps/extension/src/camera-recorder/index.html'),
      }
    ),
    authorizeCancellation({}, {}),
  ];
  for (const result of await Promise.all(attempts)) {
    expect(result.authorized).toBe(false);
    expect(result.sendResponse).toHaveBeenCalledWith({
      success: false,
      error: 'Unauthorized recording control capability',
    });
  }
});

it('refuses cancellation when the prepared lease belongs to another popup URL', async () => {
  await issuePreparedVideoRecordingLease({
    captureMode: CaptureMode.TAB,
    ownerSenderUrl: `${ownerSenderUrl}?different-owner`,
  });
  expect((await authorizeCancellation()).authorized).toBe(false);
});

it('refuses expired prepared and terminal cancellation authority', async () => {
  const lease = await prepareLease();
  vi.setSystemTime(lease.expiresAt);
  expect((await authorizeCancellation()).authorized).toBe(false);
  vi.setSystemTime(new Date('2026-10-20T12:00:00Z'));
  resetActiveVideoRecordingLeaseForTests();
  sessionGet.mockResolvedValue({
    'video-active-recording-lease': {
      ...lease,
      version: 2,
      phase: 'terminal',
      surfaceBinding: { generation: 1, streamInstanceId: 'stream-1' },
      terminal: { outcome: 'unknown', cleanupStep: 'surface', discard: false },
    },
  });
  await hydrateVideoRecordingLeaseCache();
  expect(getActiveVideoRecordingLeaseSnapshot()?.phase).toBe('terminal');
  expect((await authorizeCancellation()).authorized).toBe(false);
});

it('keeps prepared leases out of active controls and preserves active authorization', async () => {
  await prepareLease();
  const messages = [
    { type: VideoMessageType.PAUSE_RECORDING, ...capability },
    { type: VideoMessageType.RESUME_RECORDING, ...capability },
    { type: VideoMessageType.STOP_RECORDING, ...capability },
    { type: VideoMessageType.UPDATE_SETTINGS, ...capability, settings: DEFAULT_VIDEO_SETTINGS },
  ] as const;
  for (const message of messages) {
    expect(
      await isAuthorizedRecordingControl({ message, sender: popupSender, sendResponse: vi.fn() })
    ).toBe(false);
  }
  await activateVideoRecordingLease({
    generation: 1,
    recordingId: capability.recordingId,
    streamInstanceId: null,
  });
  runtimeState.mockReturnValue({ status: VideoRecordingStatus.RECORDING });
  for (const message of messages) {
    expect(
      await isAuthorizedRecordingControl({ message, sender: popupSender, sendResponse: vi.fn() })
    ).toBe(true);
  }
  expect((await authorizeCancellation()).authorized).toBe(true);
});
