import { useEffect, useState } from 'react';

export function useEmbeddedCameraPeer(args: {
  enabled: boolean;
  onOffer?: (sdp: string) => Promise<string>;
  onPeerClose?: () => Promise<void> | void;
}): MediaStream | null {
  const { enabled, onOffer, onPeerClose } = args;
  const [stream, setStream] = useState<MediaStream | null>(null);

  useEffect(() => {
    if (!enabled || !onOffer) return;
    const peer = new RTCPeerConnection();
    let active = true;
    peer.addTransceiver('video', { direction: 'recvonly' });
    peer.ontrack = (event) => {
      if (active) setStream(event.streams[0] ?? new MediaStream([event.track]));
    };
    void negotiateNonTrickleAnswer(peer, onOffer, () => active).catch(() => undefined);
    return () => {
      active = false;
      peer.close();
      setStream(null);
      void onPeerClose?.();
    };
  }, [enabled, onOffer, onPeerClose]);

  return stream;
}

async function negotiateNonTrickleAnswer(
  peer: RTCPeerConnection,
  onOffer: (sdp: string) => Promise<string>,
  isActive: () => boolean
): Promise<void> {
  const offer = await peer.createOffer();
  await peer.setLocalDescription(offer);
  await waitForIceGathering(peer);
  const sdp = peer.localDescription?.sdp;
  if (!isActive() || !sdp) return;
  const answer = await onOffer(sdp);
  if (isActive()) await peer.setRemoteDescription({ type: 'answer', sdp: answer });
}

function waitForIceGathering(peer: RTCPeerConnection): Promise<void> {
  if (peer.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    const listener = () => {
      if (peer.iceGatheringState !== 'complete') return;
      peer.removeEventListener('icegatheringstatechange', listener);
      resolve();
    };
    peer.addEventListener('icegatheringstatechange', listener);
  });
}
