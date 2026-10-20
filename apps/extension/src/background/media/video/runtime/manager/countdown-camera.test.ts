import { beforeEach, expect, it, vi } from 'vitest';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';
import { routeCountdownCamera } from './countdown-camera';

const mocks = vi.hoisted(() => ({
  lease: vi.fn(),
  state: vi.fn(),
  sender: vi.fn(),
  hydrate: vi.fn(),
  send: vi.fn(),
}));

vi.mock('../../recording-control-lease', () => ({
  getActiveVideoRecordingLeaseSnapshot: mocks.lease,
}));
vi.mock('../recording-completion', () => ({
  ensureActiveVideoRecordingLeaseHydrated: mocks.hydrate,
}));
vi.mock('../session-state', () => ({ getVideoRecordingRuntimeState: mocks.state }));
vi.mock('../sender-policy', () => ({ resolveTrustedPopupRuntimeSenderUrl: mocks.sender }));
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
  mocks.hydrate.mockResolvedValue(null);
  mocks.sender.mockReturnValue('popup-url');
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
