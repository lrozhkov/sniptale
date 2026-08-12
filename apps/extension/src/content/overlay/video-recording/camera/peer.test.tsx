// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { useEmbeddedCameraPeer } from './peer';

class TestPeerConnection extends EventTarget {
  iceGatheringState: RTCIceGatheringState = 'complete';
  localDescription = { sdp: 'offer-sdp', type: 'offer' as const };
  ontrack: ((event: { streams: MediaStream[]; track?: MediaStreamTrack }) => void) | null = null;
  addTransceiver = vi.fn();
  close = vi.fn();
  createOffer = vi.fn().mockResolvedValue({ sdp: 'offer-sdp', type: 'offer' });
  setLocalDescription = vi.fn().mockResolvedValue(undefined);
  setRemoteDescription = vi.fn().mockResolvedValue(undefined);
}

class InstalledPeerConnection extends TestPeerConnection {
  static instance: InstalledPeerConnection | null = null;

  constructor() {
    super();
    InstalledPeerConnection.instance = this;
  }
}

let root: ReturnType<typeof createRoot> | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

it('negotiates once and closes the page peer on disposal', async () => {
  vi.stubGlobal('RTCPeerConnection', InstalledPeerConnection);
  const onOffer = vi.fn().mockResolvedValue('answer-sdp');
  const onPeerClose = vi.fn();
  const host = document.createElement('div');
  root = createRoot(host);
  function Probe() {
    useEmbeddedCameraPeer({ enabled: true, onOffer, onPeerClose });
    return null;
  }

  await act(async () => root?.render(<Probe />));
  await vi.waitFor(() => expect(onOffer).toHaveBeenCalledWith('offer-sdp'));
  const peer = InstalledPeerConnection.instance!;
  expect(peer.setRemoteDescription).toHaveBeenCalledWith({ type: 'answer', sdp: 'answer-sdp' });
  act(() => root?.unmount());
  root = null;
  expect(peer.close).toHaveBeenCalledOnce();
  expect(onPeerClose).toHaveBeenCalledOnce();
});

it('does not create a peer until both enablement and an offer port are present', () => {
  vi.stubGlobal('RTCPeerConnection', InstalledPeerConnection);
  InstalledPeerConnection.instance = null;
  const host = document.createElement('div');
  root = createRoot(host);
  function Probe() {
    useEmbeddedCameraPeer({ enabled: false, onOffer: vi.fn() });
    return null;
  }
  act(() => root?.render(<Probe />));
  expect(InstalledPeerConnection.instance).toBeNull();
});

it('renegotiates the preview when the surface advances its peer generation', async () => {
  vi.stubGlobal('RTCPeerConnection', InstalledPeerConnection);
  const onOffer = vi.fn().mockResolvedValue('answer-sdp');
  const onPeerClose = vi.fn();
  const host = document.createElement('div');
  root = createRoot(host);
  function Probe({ peerGeneration }: { peerGeneration: number }) {
    useEmbeddedCameraPeer({ enabled: true, onOffer, onPeerClose, peerGeneration });
    return null;
  }

  await act(async () => root?.render(<Probe peerGeneration={1} />));
  await vi.waitFor(() => expect(onOffer).toHaveBeenCalledTimes(1));
  const firstPeer = InstalledPeerConnection.instance!;
  await act(async () => root?.render(<Probe peerGeneration={2} />));
  await vi.waitFor(() => expect(onOffer).toHaveBeenCalledTimes(2));

  expect(firstPeer.close).toHaveBeenCalledOnce();
  expect(onPeerClose).toHaveBeenCalledOnce();
  expect(InstalledPeerConnection.instance).not.toBe(firstPeer);
});

it('waits for ICE gathering and accepts the first remote stream', async () => {
  class GatheringPeerConnection extends InstalledPeerConnection {
    iceGatheringState: RTCIceGatheringState = 'gathering';
  }
  vi.stubGlobal('RTCPeerConnection', GatheringPeerConnection);
  const onOffer = vi.fn().mockResolvedValue('answer-sdp');
  let currentStream: MediaStream | null = null;
  const host = document.createElement('div');
  root = createRoot(host);
  function Probe() {
    currentStream = useEmbeddedCameraPeer({ enabled: true, onOffer });
    return null;
  }
  await act(async () => root?.render(<Probe />));
  const peer = InstalledPeerConnection.instance!;
  expect(onOffer).not.toHaveBeenCalled();
  peer.iceGatheringState = 'complete';
  peer.dispatchEvent(new Event('icegatheringstatechange'));
  await vi.waitFor(() => expect(onOffer).toHaveBeenCalledWith('offer-sdp'));
  expect(currentStream).toBeNull();
  const remoteStream = {} as MediaStream;
  act(() => {
    peer.ontrack?.({ streams: [remoteStream] });
  });
  expect(currentStream).toBe(remoteStream);
});

it('surfaces camera negotiation failures without retaining a failed stream', async () => {
  vi.stubGlobal('RTCPeerConnection', InstalledPeerConnection);
  const onError = vi.fn();
  const host = document.createElement('div');
  root = createRoot(host);
  function Probe() {
    useEmbeddedCameraPeer({
      enabled: true,
      onError,
      onOffer: vi.fn().mockRejectedValue(new Error('peer rejected')),
    });
    return null;
  }

  await act(async () => root?.render(<Probe />));
  await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(new Error('peer rejected')));
});

it('continues with the gathered offer when ICE does not report complete', async () => {
  vi.useFakeTimers();
  class StalledPeerConnection extends InstalledPeerConnection {
    iceGatheringState: RTCIceGatheringState = 'gathering';
    removeEventListener = vi.fn(super.removeEventListener.bind(this));
  }
  vi.stubGlobal('RTCPeerConnection', StalledPeerConnection);
  const onError = vi.fn();
  const onOffer = vi.fn().mockResolvedValue('answer-sdp');
  const host = document.createElement('div');
  root = createRoot(host);
  function Probe() {
    useEmbeddedCameraPeer({ enabled: true, onError, onOffer });
    return null;
  }

  await act(async () => root?.render(<Probe />));
  await act(async () => vi.advanceTimersByTimeAsync(3_000));

  expect(onOffer).toHaveBeenCalledWith('offer-sdp');
  expect(onError).not.toHaveBeenCalled();
  expect(InstalledPeerConnection.instance?.setRemoteDescription).toHaveBeenCalledWith({
    type: 'answer',
    sdp: 'answer-sdp',
  });
  expect(InstalledPeerConnection.instance?.removeEventListener).toHaveBeenCalled();
  vi.useRealTimers();
});
