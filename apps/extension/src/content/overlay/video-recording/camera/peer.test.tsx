// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { useEmbeddedCameraPeer } from './peer';

class TestPeerConnection extends EventTarget {
  iceGatheringState: RTCIceGatheringState = 'complete';
  localDescription = { sdp: 'offer-sdp', type: 'offer' as const };
  ontrack: ((event: RTCTrackEvent) => void) | null = null;
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
});
