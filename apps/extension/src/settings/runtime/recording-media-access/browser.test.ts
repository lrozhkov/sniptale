import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';
import {
  readRecordingMediaAccessState,
  retainRecordingMediaDevice,
  subscribeRecordingMediaAccessState,
} from './browser';

const mocks = vi.hoisted(() => ({
  parse: vi.fn(),
  send: vi.fn(),
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
}));

vi.mock('../messaging', () => ({
  settingsRuntimeMessagingTransport: { sendRuntimeMessage: mocks.send },
}));
vi.mock('../../../contracts/messaging/parsers/boundary', () => ({
  parseRuntimeRequestMessage: mocks.parse,
}));
vi.mock('@sniptale/platform/browser/runtime', () => ({
  browserRuntime: { subscribeToMessages: mocks.subscribe },
  runtimeInfo: {
    getURL: (path: string) => `chrome-extension://extension-id/${path}`,
    getManifest: () => ({ background: { service_worker: 'worker.js' } }),
  },
}));

class TestPermissionStatus extends EventTarget {
  state: PermissionState = 'granted';
}

class TestTrack extends EventTarget {
  enabled = true;
  readyState = 'live';
  stop = vi.fn(() => {
    this.readyState = 'ended';
  });
}

const state = {
  status: VideoRecordingStatus.RECORDING,
  duration: 0,
  countdownEndsAt: null,
  captureMode: null,
  captureSource: null,
  viewportPresetId: null,
  liveMedia: null,
  error: null,
};

const backgroundSender = {
  id: 'extension-id',
  url: 'chrome-extension://extension-id/worker.js',
  origin: 'chrome-extension://extension-id',
};

let permission: TestPermissionStatus;
let track: TestTrack;
let query: ReturnType<typeof vi.fn>;
let acquire: ReturnType<typeof vi.fn>;
let requestLock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  permission = new TestPermissionStatus();
  track = new TestTrack();
  query = vi.fn().mockResolvedValue(permission);
  acquire = vi.fn().mockResolvedValue({ getTracks: () => [track] });
  requestLock = vi.fn(async (_name, _options, callback) => callback());
  vi.stubGlobal('navigator', {
    permissions: { query },
    mediaDevices: { getUserMedia: acquire },
    locks: { request: requestLock },
  });
  mocks.subscribe.mockReturnValue(mocks.unsubscribe);
  mocks.parse.mockImplementation((message) => message);
});

afterEach(() => vi.unstubAllGlobals());

async function settleAcquisition() {
  await vi.waitFor(() => expect(acquire).toHaveBeenCalledTimes(1));
  await Promise.resolve();
}

it('reads state through the typed Settings transport and rejects unsuccessful replies', async () => {
  mocks.send.mockResolvedValue({ success: true, state });
  await expect(readRecordingMediaAccessState()).resolves.toEqual(state);
  expect(mocks.send).toHaveBeenCalledWith({ type: VideoMessageType.GET_RECORDING_STATE });
  mocks.send.mockResolvedValue({ success: false, error: 'private error' });
  await expect(readRecordingMediaAccessState()).rejects.toThrow(
    'Recording media access is unavailable.'
  );
});

it('accepts only parsed recording state messages from the actual background worker', () => {
  const listener = vi.fn();
  const dispose = subscribeRecordingMediaAccessState(listener);
  const receive = mocks.subscribe.mock.calls[0]?.[0];
  const message = { type: VideoMessageType.RECORDING_STATE_SYNC, state };
  receive(message, backgroundSender);
  expect(listener).toHaveBeenCalledExactlyOnceWith(state);
  dispose();
  expect(mocks.unsubscribe).toHaveBeenCalledOnce();
});

it.each([
  { ...backgroundSender, id: 'other-extension' },
  { ...backgroundSender, tab: { id: 1 } },
  { ...backgroundSender, documentId: 'page-document' },
  { ...backgroundSender, url: 'chrome-extension://extension-id/settings.html' },
  { ...backgroundSender, url: 'chrome-extension://extension-id/worker.js?spoof=1' },
  { ...backgroundSender, origin: 'https://example.com' },
  { ...backgroundSender, url: undefined },
])('ignores a sender outside the exact worker identity: %j', (sender) => {
  const listener = vi.fn();
  subscribeRecordingMediaAccessState(listener);
  const receive = mocks.subscribe.mock.calls[0]?.[0];
  receive({ type: VideoMessageType.RECORDING_STATE_SYNC, state }, sender);
  expect(listener).not.toHaveBeenCalled();
});

it('ignores malformed and unrelated runtime messages', () => {
  const listener = vi.fn();
  subscribeRecordingMediaAccessState(listener);
  const receive = mocks.subscribe.mock.calls[0]?.[0];
  receive({ type: VideoMessageType.GET_RECORDING_STATE }, backgroundSender);
  mocks.parse.mockImplementation(() => {
    throw new Error('Invalid message');
  });
  receive({ type: VideoMessageType.RECORDING_STATE_SYNC }, backgroundSender);
  expect(listener).not.toHaveBeenCalled();
});

it.each([
  ['microphone', 'mic-1', { audio: { deviceId: { exact: 'mic-1' } }, video: false }],
  ['camera', 'cam-1', { audio: false, video: { deviceId: { exact: 'cam-1' } } }],
  ['microphone', null, { audio: true, video: false }],
  ['camera', null, { audio: false, video: true }],
] as const)(
  'retains only the selected %s device with disabled tracks',
  async (kind, deviceId, constraints) => {
    const controller = new AbortController();
    const retained = retainRecordingMediaDevice(kind, deviceId, controller.signal);
    await settleAcquisition();
    expect(query).toHaveBeenCalledWith({ name: kind });
    expect(acquire).toHaveBeenCalledWith(constraints);
    expect(requestLock).toHaveBeenCalledWith(
      `sniptale:recording-media-access:${kind}`,
      { signal: controller.signal },
      expect.any(Function)
    );
    expect(track.enabled).toBe(false);
    expect(track.stop).not.toHaveBeenCalled();
    controller.abort();
    await expect(retained).resolves.toBeUndefined();
    expect(track.stop).toHaveBeenCalledOnce();
  }
);

it.each(['prompt', 'denied'] as const)(
  'does not reacquire or prompt with native state %s',
  async (nativeState) => {
    permission.state = nativeState;
    await expect(
      retainRecordingMediaDevice('microphone', null, new AbortController().signal)
    ).rejects.toThrow('Recording media access is unavailable.');
    expect(acquire).not.toHaveBeenCalled();
  }
);

it('releases the lock immediately on abort and stops a late acquisition', async () => {
  const extraTrack = new TestTrack();
  let resolveAcquisition: ((stream: { getTracks(): TestTrack[] }) => void) | undefined;
  acquire.mockReturnValue(
    new Promise((resolve) => {
      resolveAcquisition = resolve;
    })
  );
  const controller = new AbortController();
  const retained = retainRecordingMediaDevice('microphone', null, controller.signal);
  await settleAcquisition();
  controller.abort();
  await expect(retained).resolves.toBeUndefined();
  resolveAcquisition?.({ getTracks: () => [track, extraTrack] });
  await vi.waitFor(() => expect(track.stop).toHaveBeenCalledOnce());
  expect(track.enabled).toBe(false);
  expect(extraTrack.enabled).toBe(false);
  expect(extraTrack.stop).toHaveBeenCalledOnce();
});

it('releases immediately while native permission lookup is pending', async () => {
  let resolvePermission: ((value: TestPermissionStatus) => void) | undefined;
  query.mockReturnValue(
    new Promise((resolve) => {
      resolvePermission = resolve;
    })
  );
  const controller = new AbortController();
  const retained = retainRecordingMediaDevice('microphone', null, controller.signal);
  controller.abort();
  await expect(retained).resolves.toBeUndefined();
  resolvePermission?.(permission);
  await Promise.resolve();
  expect(acquire).not.toHaveBeenCalled();
});

it('removes native listeners after normal cancellation', async () => {
  const removePermissionListener = vi.spyOn(permission, 'removeEventListener');
  const removeTrackListener = vi.spyOn(track, 'removeEventListener');
  const controller = new AbortController();
  const retained = retainRecordingMediaDevice('microphone', null, controller.signal);
  await settleAcquisition();
  controller.abort();
  await retained;
  expect(removePermissionListener).toHaveBeenCalledWith('change', expect.any(Function));
  expect(removeTrackListener).toHaveBeenCalledWith('ended', expect.any(Function));
  permission.state = 'prompt';
  permission.dispatchEvent(new Event('change'));
  track.dispatchEvent(new Event('ended'));
  expect(track.stop).toHaveBeenCalledOnce();
});

it('does not hold the lock after native revocation during acquisition', async () => {
  let resolveAcquisition: ((stream: { getTracks(): TestTrack[] }) => void) | undefined;
  acquire.mockReturnValue(
    new Promise((resolve) => {
      resolveAcquisition = resolve;
    })
  );
  const retained = retainRecordingMediaDevice('camera', null, new AbortController().signal);
  const assertion = expect(retained).rejects.toThrow('Recording media access is unavailable.');
  await settleAcquisition();
  permission.state = 'denied';
  permission.dispatchEvent(new Event('change'));
  await assertion;
  resolveAcquisition?.({ getTracks: () => [track] });
  await vi.waitFor(() => expect(track.stop).toHaveBeenCalledOnce());
});

it('handles a late acquisition rejection after cancellation', async () => {
  let rejectAcquisition: ((error: Error) => void) | undefined;
  acquire.mockReturnValue(
    new Promise((_resolve, reject) => {
      rejectAcquisition = reject;
    })
  );
  const controller = new AbortController();
  const retained = retainRecordingMediaDevice('camera', null, controller.signal);
  await settleAcquisition();
  controller.abort();
  await expect(retained).resolves.toBeUndefined();
  rejectAcquisition?.(new Error('Device removed'));
  await Promise.resolve();
});

it.each(['permission', 'track'] as const)(
  'releases and reports native %s loss',
  async (trigger) => {
    const retained = retainRecordingMediaDevice('microphone', null, new AbortController().signal);
    const assertion = expect(retained).rejects.toThrow('Recording media access is unavailable.');
    await settleAcquisition();
    if (trigger === 'permission') {
      permission.state = 'denied';
      permission.dispatchEvent(new Event('change'));
    } else {
      track.dispatchEvent(new Event('ended'));
    }
    await assertion;
    expect(track.stop).toHaveBeenCalledOnce();
  }
);

it('does not start acquisition after a queued lock request is cancelled', async () => {
  requestLock.mockImplementation(
    (_name, options) =>
      new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError'))
        );
      })
  );
  const controller = new AbortController();
  const retained = retainRecordingMediaDevice('camera', null, controller.signal);
  controller.abort();
  await expect(retained).resolves.toBeUndefined();
  expect(acquire).not.toHaveBeenCalled();
});

it('does not request a lock for an already cancelled operation', async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(
    retainRecordingMediaDevice('camera', null, controller.signal)
  ).resolves.toBeUndefined();
  expect(requestLock).not.toHaveBeenCalled();
});

it('normalizes acquisition failures without exposing native details', async () => {
  acquire.mockRejectedValue(new Error('Private device name'));
  await expect(
    retainRecordingMediaDevice('camera', null, new AbortController().signal)
  ).rejects.toThrow('Recording media access is unavailable.');
});
