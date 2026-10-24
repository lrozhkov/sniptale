import { beforeEach, expect, it, vi } from 'vitest';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { CaptureMode, VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';
import { routeCountdownCamera } from './countdown-camera';

const mocks = vi.hoisted(() => ({
  lease: vi.fn(),
  state: vi.fn(),
  sender: vi.fn(),
  hydrate: vi.fn(),
  cache: vi.fn(),
  send: vi.fn(),
  contexts: vi.fn(),
  cameraSender: vi.fn(),
  admitted: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/runtime', () => ({
  runtimeInfo: { getContexts: mocks.contexts },
}));

vi.mock('../../recording-control-lease', () => ({
  getActiveVideoRecordingLeaseSnapshot: mocks.lease,
  ensureVideoRecordingLeaseCache: mocks.cache,
}));
vi.mock('../recording-completion', () => ({
  ensureActiveVideoRecordingLeaseHydrated: mocks.hydrate,
}));
vi.mock('../session-state', () => ({ getVideoRecordingRuntimeState: mocks.state }));
vi.mock('../sender-policy', () => ({
  resolveTrustedPopupRuntimeSenderUrl: mocks.sender,
  resolveTrustedCameraRecorderRuntimeSenderUrl: mocks.cameraSender,
}));
vi.mock('../camera-recorder-control', () => ({
  isAuthorizedCameraRecorderDocument: mocks.admitted,
}));
vi.mock('../../../../routing-contracts/runtime-messaging/services', () => ({
  getBackgroundRuntimeMessaging: () => ({ sendRuntimeMessage: mocks.send }),
}));
vi.mock('@sniptale/platform/security/offscreen-command-capability', () => ({
  attachOffscreenCommandCapability: (message: unknown) => message,
}));

let sequence = 0;
let activeRecordingId = '';
const sender = { documentId: 'popup-document', url: 'popup-url' };

beforeEach(() => {
  vi.clearAllMocks();
  sequence += 1;
  activeRecordingId = `recording-${sequence}`;
  mocks.hydrate.mockReset().mockResolvedValue(null);
  mocks.cache.mockReset().mockResolvedValue(null);
  mocks.sender.mockReturnValue('popup-url');
  mocks.cameraSender.mockReturnValue(null);
  mocks.admitted.mockReturnValue(false);
  mocks.lease.mockReturnValue({
    phase: 'prepared',
    expiresAt: Date.now() + 100_000,
    ownerSenderUrl: 'popup-url',
    recordingId: activeRecordingId,
    controlToken: 'token',
    surfaceBinding: { generation: 1, streamInstanceId: 'stream' },
  });
  mocks.state.mockReturnValue({ status: VideoRecordingStatus.COUNTDOWN });
  mocks.send.mockResolvedValue({ success: true, sdp: 'answer' });
  mocks.contexts.mockResolvedValue([]);
});

function command(peerGeneration = 0) {
  return {
    type: VideoMessageType.COUNTDOWN_CAMERA_OFFER,
    controlToken: 'token',
    recordingId: activeRecordingId,
    peerGeneration,
    sdp: 'offer',
  };
}

async function flush() {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

it('negotiates only the prepared source and derives document-bound peer identity', async () => {
  const reply = vi.fn();
  routeCountdownCamera({ message: command(), sender, sendResponse: reply });
  await flush();
  expect(mocks.send).toHaveBeenCalledWith({
    type: VideoMessageType.OFFSCREEN_VIDEO_RECORDING_CAMERA_OFFER,
    peerId: `countdown:${JSON.stringify([activeRecordingId, sender.documentId, 0])}`,
    sdp: 'offer',
    source: {
      kind: 'countdown',
      recordingId: activeRecordingId,
      generation: 1,
      streamInstanceId: 'stream',
    },
  });
  expect(reply).toHaveBeenCalledWith({ success: true, sdp: 'answer' });
  expect(mocks.hydrate).toHaveBeenCalledOnce();
  expect(mocks.cache).not.toHaveBeenCalled();
  expect(mocks.contexts).not.toHaveBeenCalled();
});

function popupContext(documentId = 'native-popup-document') {
  return { contextType: 'POPUP', documentUrl: sender.url, documentId };
}

function dispatchNativePopup(
  message: Parameters<typeof routeCountdownCamera>[0]['message'] = command()
) {
  const response = Promise.withResolvers<unknown>();
  routeCountdownCamera({
    message,
    sender: { url: sender.url },
    sendResponse: response.resolve,
  });
  return response.promise;
}

it('resolves the actual action popup document from its unique browser-owned context', async () => {
  mocks.contexts.mockResolvedValue([popupContext()]);
  await expect(dispatchNativePopup()).resolves.toEqual({ success: true, sdp: 'answer' });
  expect(mocks.contexts).toHaveBeenCalledWith({ documentUrls: [sender.url] });
  expect(mocks.send).toHaveBeenCalledWith(
    expect.objectContaining({
      peerId: `countdown:${JSON.stringify([activeRecordingId, 'native-popup-document', 0])}`,
    })
  );
});

it.each([
  ['absent', []],
  ['ambiguous', [popupContext(), popupContext('another-document')]],
  ['other URL', [{ ...popupContext(), documentUrl: 'untrusted-url' }]],
  ['ordinary tab context', [{ ...popupContext(), contextType: 'TAB' }]],
  ['missing document', [{ ...popupContext(), documentId: undefined }]],
  ['invalid document', [{ ...popupContext(), documentId: null }]],
  ['empty document', [popupContext('')]],
] as const)('refuses %s native popup context before effects', async (_failure, contexts) => {
  mocks.contexts.mockResolvedValue(contexts);
  await expect(dispatchNativePopup()).resolves.toEqual(expect.objectContaining({ success: false }));
  expect(mocks.send).not.toHaveBeenCalled();
});

it('refuses unavailable context lookup without effects', async () => {
  mocks.contexts.mockRejectedValue(new Error('context lookup unavailable'));
  await expect(dispatchNativePopup()).resolves.toEqual(expect.objectContaining({ success: false }));
  expect(mocks.send).not.toHaveBeenCalled();
});

it('allows native popup cleanup after BEGIN with the same browser-owned document', async () => {
  mocks.contexts.mockResolvedValue([popupContext()]);
  await expect(dispatchNativePopup()).resolves.toEqual({ success: true, sdp: 'answer' });
  mocks.lease.mockReturnValue({ ...mocks.lease(), phase: 'active' });
  mocks.state.mockReturnValue({ status: VideoRecordingStatus.RECORDING });
  await expect(
    dispatchNativePopup({ ...command(), type: VideoMessageType.COUNTDOWN_CAMERA_CLOSE })
  ).resolves.toEqual({ success: true });
  expect(mocks.send).toHaveBeenLastCalledWith({
    type: VideoMessageType.OFFSCREEN_VIDEO_RECORDING_CAMERA_CLOSE,
    peerId: `countdown:${JSON.stringify([activeRecordingId, 'native-popup-document', 0])}`,
  });
});

it('does not use popup context discovery for an ordinary tab without document identity', async () => {
  mocks.contexts.mockResolvedValue([popupContext()]);
  const reply = vi.fn();
  routeCountdownCamera({
    message: command(),
    sender: {
      url: sender.url,
      tab: {
        id: 7,
        index: 0,
        pinned: false,
        highlighted: false,
        windowId: 1,
        active: true,
        frozen: false,
        incognito: false,
        selected: true,
        discarded: false,
        autoDiscardable: true,
        groupId: -1,
        lastAccessed: 0,
      },
    },
    sendResponse: reply,
  });
  await flush();
  expect(reply).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  expect(mocks.contexts).not.toHaveBeenCalled();
  expect(mocks.send).not.toHaveBeenCalled();
});

it('refuses untrusted native popup senders before context discovery', async () => {
  mocks.sender.mockReturnValue(null);
  mocks.contexts.mockResolvedValue([popupContext()]);
  await expect(dispatchNativePopup()).resolves.toEqual(expect.objectContaining({ success: false }));
  expect(mocks.contexts).not.toHaveBeenCalled();
  expect(mocks.send).not.toHaveBeenCalled();
});

it.each(['expired', 'replacement lease', 'source', 'BEGIN'] as const)(
  'refuses %s after asynchronous native document discovery',
  async (change) => {
    const contexts = Promise.withResolvers<ReturnType<typeof popupContext>[]>();
    mocks.contexts.mockReturnValue(contexts.promise);
    const response = dispatchNativePopup();
    await flush();
    if (change === 'expired') mocks.lease.mockReturnValue({ ...mocks.lease(), expiresAt: 0 });
    if (change === 'replacement lease')
      mocks.lease.mockReturnValue({ ...mocks.lease(), controlToken: 'replacement' });
    if (change === 'source')
      mocks.lease.mockReturnValue({
        ...mocks.lease(),
        surfaceBinding: { generation: 2, streamInstanceId: 'replacement' },
      });
    if (change === 'BEGIN') {
      mocks.lease.mockReturnValue({ ...mocks.lease(), phase: 'active' });
      mocks.state.mockReturnValue({ status: VideoRecordingStatus.RECORDING });
    }
    contexts.resolve([popupContext()]);
    await expect(response).resolves.toEqual(expect.objectContaining({ success: false }));
    expect(mocks.send).not.toHaveBeenCalled();
  }
);

it('keeps a late answer cleanup on its original popup document after replacement', async () => {
  const answer = Promise.withResolvers<{ success: boolean; sdp: string }>();
  mocks.contexts.mockResolvedValueOnce([popupContext('old-popup')]);
  mocks.send.mockReturnValueOnce(answer.promise);
  const oldResponse = dispatchNativePopup();
  await flush();
  mocks.contexts.mockResolvedValue([popupContext('new-popup')]);
  await expect(dispatchNativePopup()).resolves.toEqual({ success: true, sdp: 'answer' });
  mocks.state.mockReturnValue({ status: VideoRecordingStatus.RECORDING });
  answer.resolve({ success: true, sdp: 'late answer' });
  await expect(oldResponse).resolves.toEqual(expect.objectContaining({ success: false }));
  expect(mocks.send).toHaveBeenLastCalledWith({
    type: VideoMessageType.OFFSCREEN_VIDEO_RECORDING_CAMERA_CLOSE,
    peerId: `countdown:${JSON.stringify([activeRecordingId, 'old-popup', 0])}`,
  });
});

it.each(['sender', 'capability', 'expired', 'phase', 'status', 'document'] as const)(
  'refuses %s before device effects',
  async (failure) => {
    const reply = vi.fn();
    const message = command();
    if (failure === 'sender') mocks.sender.mockReturnValue(null);
    if (failure === 'capability') message.controlToken = 'wrong';
    if (failure === 'expired') mocks.lease.mockReturnValue({ ...mocks.lease(), expiresAt: 0 });
    if (failure === 'phase') mocks.lease.mockReturnValue({ ...mocks.lease(), phase: 'active' });
    if (failure === 'status')
      mocks.state.mockReturnValue({ status: VideoRecordingStatus.RECORDING });
    routeCountdownCamera({
      message,
      sender: failure === 'document' ? undefined : sender,
      sendResponse: reply,
    });
    await flush();
    expect(reply).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    expect(mocks.send).not.toHaveBeenCalled();
  }
);

it('refuses a closed generation before any later OFFER can recreate it', async () => {
  const message = command();
  const closeReply = vi.fn();
  routeCountdownCamera({
    message: { ...message, type: VideoMessageType.COUNTDOWN_CAMERA_CLOSE },
    sender,
    sendResponse: closeReply,
  });
  await flush();
  const offerReply = vi.fn();
  routeCountdownCamera({ message, sender, sendResponse: offerReply });
  await flush();
  expect(offerReply).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  expect(
    mocks.send.mock.calls.filter(
      ([payload]) => payload.type === VideoMessageType.OFFSCREEN_VIDEO_RECORDING_CAMERA_OFFER
    )
  ).toHaveLength(0);
});

it('retires a pending answer after CLOSE without closing a newer peer', async () => {
  const answer = Promise.withResolvers<{ success: boolean; sdp: string }>();
  mocks.send.mockImplementation((payload) =>
    payload.type === VideoMessageType.OFFSCREEN_VIDEO_RECORDING_CAMERA_OFFER &&
    payload.peerId.endsWith(',0]')
      ? answer.promise
      : Promise.resolve({ success: true, sdp: 'new-answer' })
  );
  const oldReply = vi.fn();
  routeCountdownCamera({ message: command(), sender, sendResponse: oldReply });
  await flush();
  routeCountdownCamera({
    message: { ...command(), type: VideoMessageType.COUNTDOWN_CAMERA_CLOSE },
    sender,
    sendResponse: vi.fn(),
  });
  await flush();
  const newReply = vi.fn();
  routeCountdownCamera({ message: command(1), sender, sendResponse: newReply });
  await flush();
  answer.resolve({ success: true, sdp: 'old-answer' });
  await flush();
  expect(oldReply).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  expect(newReply).toHaveBeenCalledWith({ success: true, sdp: 'new-answer' });
  expect(
    mocks.send.mock.calls
      .filter(
        ([payload]) => payload.type === VideoMessageType.OFFSCREEN_VIDEO_RECORDING_CAMERA_CLOSE
      )
      .every(([payload]) => payload.peerId.endsWith(',0]'))
  ).toBe(true);
});

it('closes its own peer when negotiation transport fails after dispatch', async () => {
  mocks.send.mockRejectedValueOnce(new Error('transport unavailable'));
  const reply = vi.fn();
  routeCountdownCamera({ message: command(), sender, sendResponse: reply });
  await flush();
  expect(reply).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  expect(mocks.send).toHaveBeenLastCalledWith({
    type: VideoMessageType.OFFSCREEN_VIDEO_RECORDING_CAMERA_CLOSE,
    peerId: `countdown:${JSON.stringify([activeRecordingId, sender.documentId, 0])}`,
  });
});

it('retires an answer that crosses BEGIN and permits matching cleanup afterward', async () => {
  const answer = Promise.withResolvers<{ success: boolean; sdp: string }>();
  mocks.send.mockReturnValueOnce(answer.promise);
  const reply = vi.fn();
  routeCountdownCamera({ message: command(), sender, sendResponse: reply });
  await flush();
  mocks.lease.mockReturnValue({ ...mocks.lease(), phase: 'active' });
  mocks.state.mockReturnValue({ status: VideoRecordingStatus.RECORDING });
  answer.resolve({ success: true, sdp: 'late' });
  await flush();
  expect(reply).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  const closeReply = vi.fn();
  routeCountdownCamera({
    message: { ...command(), type: VideoMessageType.COUNTDOWN_CAMERA_CLOSE },
    sender,
    sendResponse: closeReply,
  });
  await flush();
  expect(closeReply).toHaveBeenCalledWith({ success: true });
});

function activateRecorder() {
  mocks.sender.mockReturnValue(null);
  mocks.cameraSender.mockReturnValue('camera-url');
  mocks.admitted.mockReturnValue(true);
  mocks.lease.mockReturnValue({ ...mocks.lease(), phase: 'active' });
  mocks.state.mockReturnValue({
    status: VideoRecordingStatus.RECORDING,
    captureMode: CaptureMode.CAMERA,
  });
}
it('allows an admitted recorder to borrow the active camera recording source', async () => {
  activateRecorder();
  const response = Promise.withResolvers<unknown>();
  routeCountdownCamera({
    message: command(),
    sender: {
      ...sender,
      tab: {
        id: 7,
        active: true,
        autoDiscardable: true,
        discarded: false,
        highlighted: true,
        incognito: false,
        index: 0,
        pinned: false,
        selected: true,
        windowId: 1,
        groupId: -1,
        frozen: false,
        lastAccessed: 0,
      },
    },
    sendResponse: response.resolve,
  });
  await expect(response.promise).resolves.toEqual({ success: true, sdp: 'answer' });
  expect(mocks.send).toHaveBeenCalledWith(
    expect.objectContaining({
      source: {
        kind: 'recording-preview',
        recordingId: activeRecordingId,
        generation: 1,
        streamInstanceId: 'stream',
        cameraOnly: true,
      },
    })
  );
});
it('rejects an unregistered recorder before preview effects', async () => {
  activateRecorder();
  mocks.admitted.mockReturnValue(false);
  const response = Promise.withResolvers<unknown>();
  routeCountdownCamera({ message: command(), sender, sendResponse: response.resolve });
  await expect(response.promise).resolves.toEqual(expect.objectContaining({ success: false }));
  expect(mocks.send).not.toHaveBeenCalled();
});
it('retires a preview if recorder authorization changes during negotiation', async () => {
  activateRecorder();
  mocks.send.mockImplementationOnce(async () => {
    mocks.admitted.mockReturnValue(false);
    return { success: true, sdp: 'answer' };
  });
  const response = Promise.withResolvers<unknown>();
  routeCountdownCamera({ message: command(), sender, sendResponse: response.resolve });
  await expect(response.promise).resolves.toEqual(expect.objectContaining({ success: false }));
  expect(mocks.send).toHaveBeenLastCalledWith(
    expect.objectContaining({ type: VideoMessageType.OFFSCREEN_VIDEO_RECORDING_CAMERA_CLOSE })
  );
});

it.each(['popup', 'recorder'] as const)(
  'keeps the runtime failure intact when %s camera cleanup closes a peer',
  async (owner) => {
    const failureState = { status: VideoRecordingStatus.IDLE, error: 'Audio buffer failure' };
    mocks.state.mockReturnValue(failureState);
    mocks.lease.mockReturnValue({ ...mocks.lease(), phase: 'active' });
    mocks.hydrate.mockImplementationOnce(async () => {
      mocks.state.mockReturnValue({ status: VideoRecordingStatus.RECORDING, error: null });
    });
    if (owner === 'recorder') {
      mocks.sender.mockReturnValue(null);
      mocks.cameraSender.mockReturnValue('camera-recorder-url');
      mocks.admitted.mockReturnValue(true);
    }
    const response = Promise.withResolvers<unknown>();
    routeCountdownCamera({
      message: { ...command(), type: VideoMessageType.COUNTDOWN_CAMERA_CLOSE },
      sender,
      sendResponse: response.resolve,
    });
    await expect(response.promise).resolves.toEqual({ success: true });
    expect(mocks.state()).toBe(failureState);
    expect(mocks.hydrate).not.toHaveBeenCalled();
    expect(mocks.cache).toHaveBeenCalledOnce();
    expect(mocks.send).toHaveBeenCalledWith({
      type: VideoMessageType.OFFSCREEN_VIDEO_RECORDING_CAMERA_CLOSE,
      peerId:
        `${owner === 'recorder' ? 'recording-preview' : 'countdown'}:` +
        JSON.stringify([activeRecordingId, sender.documentId, 0]),
    });
  }
);

it('loads cold authority for camera cleanup without projecting it into runtime state', async () => {
  const lease = { ...mocks.lease(), phase: 'active' };
  mocks.lease.mockReturnValue(null);
  mocks.cache.mockImplementationOnce(async () => {
    mocks.lease.mockReturnValue(lease);
    return lease;
  });
  const failureState = { status: VideoRecordingStatus.IDLE, error: 'Audio buffer failure' };
  mocks.state.mockReturnValue(failureState);
  const response = Promise.withResolvers<unknown>();
  routeCountdownCamera({
    message: { ...command(), type: VideoMessageType.COUNTDOWN_CAMERA_CLOSE },
    sender,
    sendResponse: response.resolve,
  });
  await expect(response.promise).resolves.toEqual({ success: true });
  expect(mocks.cache).toHaveBeenCalledOnce();
  expect(mocks.hydrate).not.toHaveBeenCalled();
  expect(mocks.state()).toBe(failureState);
});
