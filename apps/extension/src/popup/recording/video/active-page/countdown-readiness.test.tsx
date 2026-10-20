// @vitest-environment jsdom

import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';

const { sendRuntimeMessage } = vi.hoisted(() => ({ sendRuntimeMessage: vi.fn() }));
vi.mock('../../../runtime-services', () => ({
  getPopupRuntimeServices: () => ({ messaging: { sendRuntimeMessage } }),
}));
vi.mock('../../../../platform/i18n/popup', () => ({ translate: (key: string) => key }));

import { VideoCountdownReadiness } from './countdown-readiness';

class MockPeer extends EventTarget {
  static instances: MockPeer[] = [];
  static gathering: RTCIceGatheringState = 'complete';
  iceGatheringState = MockPeer.gathering;
  connectionState: RTCPeerConnectionState = 'new';
  localDescription: RTCSessionDescriptionInit | null = null;
  ontrack: ((event: { track: { kind: string; stop: () => void } }) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  addTransceiver = vi.fn();
  close = vi.fn();
  createOffer = vi.fn().mockResolvedValue({ type: 'offer', sdp: 'local-offer' });
  setLocalDescription = vi.fn(async (description: RTCSessionDescriptionInit) => {
    this.localDescription = description;
  });
  setRemoteDescription = vi.fn().mockResolvedValue(undefined);
  constructor() {
    super();
    MockPeer.instances.push(this);
  }
}

class MockStream {
  constructor(readonly tracks: unknown[]) {}
  getTracks() {
    return this.tracks;
  }
}

type ReadinessProps = ComponentProps<typeof VideoCountdownReadiness>;
let container: HTMLDivElement;
let root: Root;
let props: ReadinessProps;

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function preparedState(recordingId = 'recording-1') {
  return {
    success: true,
    controlToken: `control-${recordingId}`,
    recordingId,
    state: { ...props.recordingState, status: VideoRecordingStatus.COUNTDOWN },
  };
}

async function render(overrides: Partial<ReadinessProps> = {}) {
  props = { ...props, ...overrides };
  await act(async () => root.render(<VideoCountdownReadiness {...props} />));
}

function offerCalls() {
  return sendRuntimeMessage.mock.calls.filter(
    ([message]) => message.type === VideoMessageType.COUNTDOWN_CAMERA_OFFER
  );
}

function closeCalls() {
  return sendRuntimeMessage.mock.calls.filter(
    ([message]) => message.type === VideoMessageType.COUNTDOWN_CAMERA_CLOSE
  );
}

function requiredAt<Value>(values: readonly Value[], index: number): Value {
  const value = values[index];
  if (value === undefined) throw new Error(`Missing test value at index ${index}`);
  return value;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('RTCPeerConnection', MockPeer);
  vi.stubGlobal('MediaStream', MockStream);
  MockPeer.instances = [];
  MockPeer.gathering = 'complete';
  sendRuntimeMessage.mockReset();
  sendRuntimeMessage.mockImplementation(async (message: { type: string }) => {
    if (message.type === VideoMessageType.GET_RECORDING_STATE) return preparedState();
    if (message.type === VideoMessageType.COUNTDOWN_CAMERA_OFFER)
      return { success: true, sdp: 'remote-answer' };
    return { success: true };
  });
  props = {
    activeRecordingId: 'recording-1',
    recordingState: {
      status: VideoRecordingStatus.COUNTDOWN,
      duration: 0,
      countdownEndsAt: 10000,
      captureMode: null,
      captureSource: null,
      viewportPresetId: null,
      error: null,
      microphoneActivity: { status: 'ready', level: 0.45, warning: false },
    },
    selection: {
      microphoneDeviceId: 'mic-1',
      microphoneEnabled: true,
      microphoneSelected: true,
      microphoneLabel: 'Microphone',
      webcamDeviceId: 'cam-1',
      webcamEnabled: true,
      webcamSelected: true,
      webcamSettings: null,
      webcamLabel: 'Camera',
    },
  };
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it('shows the microphone level and negotiates a receive-only camera from the prepared capability', async () => {
  await render();
  expect(container.querySelector('[role="meter"]')?.getAttribute('aria-valuenow')).toBe('88');
  expect(sendRuntimeMessage).toHaveBeenCalledWith({ type: VideoMessageType.GET_RECORDING_STATE });
  const peer = requiredAt(MockPeer.instances, 0);
  expect(peer.addTransceiver).toHaveBeenCalledExactlyOnceWith('video', { direction: 'recvonly' });
  expect(requiredAt(offerCalls(), 0)[0]).toMatchObject({
    recordingId: 'recording-1',
    controlToken: 'control-recording-1',
    sdp: 'local-offer',
  });
  expect(peer.setRemoteDescription).toHaveBeenCalledWith({ type: 'answer', sdp: 'remote-answer' });
  const track = { kind: 'video', stop: vi.fn() };
  await act(async () => peer.ontrack?.({ track }));
  const video = container.querySelector('video');
  expect(video?.muted).toBe(true);
  expect(video?.autoplay).toBe(true);
  expect(video?.srcObject).toBeInstanceOf(MockStream);
});

it('updates signal values without restarting the camera peer', async () => {
  await render();
  await render({
    recordingState: {
      ...props.recordingState,
      microphoneActivity: { status: 'ready', level: 0.8, warning: false },
    },
  });
  expect(container.querySelector('[role="meter"]')?.getAttribute('aria-valuenow')).toBe('97');
  expect(MockPeer.instances).toHaveLength(1);
  expect(offerCalls()).toHaveLength(1);
});

it('shows unavailable signal feedback without treating the preview as a recording failure', async () => {
  await render({
    selection: { ...props.selection, webcamEnabled: false },
    recordingState: {
      ...props.recordingState,
      microphoneActivity: { status: 'unavailable', level: 0, warning: false },
    },
  });
  expect(container.querySelector('[role="meter"]')).toBeNull();
  expect(container.textContent).toContain('countdownMicrophoneUnavailable');
  expect(sendRuntimeMessage).not.toHaveBeenCalled();
});

it('does not start preview consumers when selected devices are disabled', async () => {
  await render({
    selection: { ...props.selection, microphoneEnabled: false, webcamEnabled: false },
  });
  expect(container.textContent).toBe('');
  expect(sendRuntimeMessage).not.toHaveBeenCalled();
  expect(MockPeer.instances).toHaveLength(0);
});

it('stops remote consumer tracks and closes the matching peer when countdown completes', async () => {
  await render();
  const peer = requiredAt(MockPeer.instances, 0);
  const track = { kind: 'video', stop: vi.fn() };
  await act(async () => peer.ontrack?.({ track }));
  const offer = requiredAt(offerCalls(), 0)[0];
  await render({
    recordingState: { ...props.recordingState, status: VideoRecordingStatus.RECORDING },
  });
  expect(peer.close).toHaveBeenCalledTimes(1);
  expect(track.stop).toHaveBeenCalledTimes(1);
  expect(requiredAt(closeCalls(), 0)[0]).toEqual({
    type: VideoMessageType.COUNTDOWN_CAMERA_CLOSE,
    recordingId: offer.recordingId,
    controlToken: offer.controlToken,
    peerGeneration: offer.peerGeneration,
  });
  expect(container.querySelector('video')).toBeNull();
  expect(container.querySelector('[role="meter"]')).toBeNull();
  const lateTrack = { kind: 'video', stop: vi.fn() };
  await act(async () => peer.ontrack?.({ track: lateTrack }));
  expect(lateTrack.stop).toHaveBeenCalledOnce();
  expect(container.querySelector('video')).toBeNull();
});

it('does not create a peer from a capability that arrives after unmount', async () => {
  const state = deferred<ReturnType<typeof preparedState>>();
  sendRuntimeMessage.mockReturnValue(state.promise);
  await render();
  await act(async () => root.render(null));
  await act(async () => state.resolve(preparedState()));
  expect(MockPeer.instances).toHaveLength(0);
  expect(offerCalls()).toHaveLength(0);
});

it('closes again after an offer reply arrives after unmount and never applies the late answer', async () => {
  const answer = deferred<{ success: boolean; sdp: string }>();
  sendRuntimeMessage.mockImplementation(async (message: { type: string }) => {
    if (message.type === VideoMessageType.GET_RECORDING_STATE) return preparedState();
    if (message.type === VideoMessageType.COUNTDOWN_CAMERA_OFFER) return answer.promise;
    return { success: true };
  });
  await render();
  const peer = requiredAt(MockPeer.instances, 0);
  await act(async () => root.render(null));
  expect(closeCalls()).toHaveLength(1);
  await act(async () => answer.resolve({ success: true, sdp: 'too-late' }));
  expect(peer.setRemoteDescription).not.toHaveBeenCalled();
  expect(closeCalls()).toHaveLength(2);
  expect(requiredAt(closeCalls(), 0)[0]).toEqual(requiredAt(closeCalls(), 1)[0]);
});

it.each(['recording', 'deadline'])(
  'rejects a prepared capability for another %s',
  async (mismatch) => {
    const response = preparedState(mismatch === 'recording' ? 'other-recording' : 'recording-1');
    if (mismatch === 'deadline') response.state.countdownEndsAt = 20000;
    sendRuntimeMessage.mockResolvedValue(response);
    await render();
    expect(MockPeer.instances).toHaveLength(0);
    expect(container.textContent).toContain('countdownCameraUnavailable');
  }
);

it('retires the old peer on source change and uses a newer generation for its replacement', async () => {
  await render();
  const previous = requiredAt(MockPeer.instances, 0);
  const generation = requiredAt(offerCalls(), 0)[0].peerGeneration;
  await render({ selection: { ...props.selection, webcamDeviceId: 'camera-2' } });
  expect(previous.close).toHaveBeenCalledOnce();
  expect(MockPeer.instances).toHaveLength(2);
  expect(requiredAt(offerCalls(), 1)[0].peerGeneration).toBeGreaterThan(generation);
});

it('retires the old recording peer before connecting a new recording identity', async () => {
  await render();
  const previous = requiredAt(MockPeer.instances, 0);
  const track = { kind: 'video', stop: vi.fn() };
  await act(async () => previous.ontrack?.({ track }));
  sendRuntimeMessage.mockImplementation(async (message: { type: string }) => {
    if (message.type === VideoMessageType.GET_RECORDING_STATE) return preparedState('recording-2');
    return { success: true, sdp: 'remote-answer' };
  });
  await render({ activeRecordingId: 'recording-2' });
  expect(previous.close).toHaveBeenCalledOnce();
  expect(track.stop).toHaveBeenCalledOnce();
  expect(container.querySelector('video')).toBeNull();
  expect(requiredAt(offerCalls(), 1)[0].recordingId).toBe('recording-2');
  expect(requiredAt(closeCalls(), 0)[0].recordingId).toBe('recording-1');
});

it('bounds ICE gathering and removes its pending timer when countdown is cancelled', async () => {
  vi.useFakeTimers();
  MockPeer.gathering = 'gathering';
  await render();
  expect(offerCalls()).toHaveLength(0);
  await act(async () => vi.advanceTimersByTime(3000));
  expect(offerCalls()).toHaveLength(1);
  await render({ selection: { ...props.selection, webcamDeviceId: 'camera-2' } });
  expect(vi.getTimerCount()).toBe(1);
  await render({ recordingState: { ...props.recordingState, status: VideoRecordingStatus.IDLE } });
  expect(vi.getTimerCount()).toBe(0);
});

it('keeps camera failures advisory and closes the failed consumer', async () => {
  sendRuntimeMessage.mockImplementation(async (message: { type: string }) => {
    if (message.type === VideoMessageType.GET_RECORDING_STATE) return preparedState();
    return { success: false };
  });
  await render();
  expect(container.textContent).toContain('countdownCameraUnavailable');
  expect(container.querySelector('[role="meter"]')).not.toBeNull();
  expect(requiredAt(MockPeer.instances, 0).close).toHaveBeenCalledOnce();
  expect(closeCalls()).toHaveLength(1);
});
