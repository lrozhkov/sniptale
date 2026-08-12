import { useEffect, useState } from 'react';
import { createLogger } from '@sniptale/platform/observability/logger';

const logger = createLogger({ namespace: 'VideoRecordingCameraPeer' });
const ICE_GATHERING_TIMEOUT_MS = 3_000;

export function useEmbeddedCameraPeer(args: {
  enabled: boolean;
  peerGeneration?: number;
  onError?: (error: Error) => void;
  onOffer?: (sdp: string) => Promise<string>;
  onPeerClose?: () => Promise<void> | void;
}): MediaStream | null {
  const { enabled, onError, onOffer, onPeerClose, peerGeneration = 0 } = args;
  const [stream, setStream] = useState<MediaStream | null>(null);

  useEffect(() => {
    if (!enabled || !onOffer) return;
    const peer = new RTCPeerConnection();
    let active = true;
    peer.addTransceiver('video', { direction: 'recvonly' });
    peer.onconnectionstatechange = () => {
      logger.debug('Embedded camera peer connection state changed', {
        connectionState: peer.connectionState,
        iceConnectionState: peer.iceConnectionState,
      });
    };
    peer.ontrack = (event) => {
      if (active) setStream(event.streams[0] ?? new MediaStream([event.track]));
    };
    void negotiateNonTrickleAnswer(peer, onOffer, () => active).catch((cause) => {
      if (active) {
        logger.error('Embedded camera preview negotiation failed', cause);
        onError?.(cause instanceof Error ? cause : new Error(String(cause)));
      }
    });
    return () => {
      active = false;
      peer.close();
      setStream(null);
      void Promise.resolve(onPeerClose?.()).catch((cause) => {
        logger.warn('Embedded camera peer cleanup was not acknowledged', cause);
      });
    };
  }, [enabled, onError, onOffer, onPeerClose, peerGeneration]);

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
    const timeout = window.setTimeout(() => {
      peer.removeEventListener('icegatheringstatechange', listener);
      resolve();
    }, ICE_GATHERING_TIMEOUT_MS);
    const listener = () => {
      if (peer.iceGatheringState !== 'complete') return;
      window.clearTimeout(timeout);
      peer.removeEventListener('icegatheringstatechange', listener);
      resolve();
    };
    peer.addEventListener('icegatheringstatechange', listener);
  });
}
