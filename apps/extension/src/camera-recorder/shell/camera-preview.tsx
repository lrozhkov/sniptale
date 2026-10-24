import { useEffect, useState } from 'react';
import { MediaStreamVideo } from '../../features/video/recording/media-stream-video';
import { translate } from '../../platform/i18n';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import type { RuntimeMessagingTransport } from '../../platform/runtime-messaging';
import type { ControlCapability } from './types';

let nextPeerGeneration = 0;
type PreviewProps = {
  webcamDeviceId: string | null;
  capability: ControlCapability | null;
  messaging: RuntimeMessagingTransport;
  active: boolean;
};

type PreviewState =
  | { stream: null; status: 'idle' | 'loading' | 'error' }
  | { stream: MediaStream; status: 'ready' };

const PREVIEW_CLASS = [
  'relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-[4px]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-canvas)_84%,black_16%)]',
].join(' ');

export function CameraPreview(props: PreviewProps) {
  const state = useCameraPreview(props);

  return (
    <div className={PREVIEW_CLASS}>
      {state.status === 'ready' ? (
        <MediaStreamVideo stream={state.stream} />
      ) : (
        <div
          className="select-text px-4 text-center text-[14px] leading-5 font-normal
          text-[var(--sniptale-color-text-muted-strong)]"
        >
          {resolvePreviewStatusText(state.status)}
        </div>
      )}
    </div>
  );
}

function useCameraPreview({
  webcamDeviceId,
  capability,
  messaging,
  active,
}: PreviewProps): PreviewState {
  const [state, setState] = useState<PreviewState>({ status: 'idle', stream: null });
  const recordingId = capability?.recordingId;
  const controlToken = capability?.controlToken;
  useEffect(() => {
    setState({ status: 'idle', stream: null });
    if (!active || !webcamDeviceId || !recordingId || !controlToken) return;
    let disposed = false;
    let peer: RTCPeerConnection | null = null;
    const tracks = new Set<MediaStreamTrack>();
    const cancellation = new AbortController();
    const peerGeneration = ++nextPeerGeneration;
    const closeRemote = () =>
      void messaging
        .sendRuntimeMessage({
          type: VideoMessageType.COUNTDOWN_CAMERA_CLOSE,
          recordingId,
          controlToken,
          peerGeneration,
        })
        .catch(() => undefined);
    const cleanup = () => {
      disposed = true;
      cancellation.abort();
      peer?.close();
      tracks.forEach((track) => track.stop());
      tracks.clear();
      closeRemote();
    };
    const connect = async () => {
      setState({ status: 'loading', stream: null });
      peer = new RTCPeerConnection();
      const current = peer;
      current.addTransceiver('video', { direction: 'recvonly' });
      current.ontrack = (event) => {
        if (disposed || event.track.kind !== 'video') {
          event.track.stop();
          return;
        }
        tracks.add(event.track);
        setState({ status: 'ready', stream: new MediaStream([event.track]) });
      };
      current.onconnectionstatechange = () => {
        if (!disposed && current.connectionState === 'failed') {
          setState({ status: 'error', stream: null });
          cleanup();
        }
      };
      await current.setLocalDescription(await current.createOffer());
      if (disposed) return;
      await waitForPreviewIce(current, cancellation.signal);
      if (disposed) return;
      const sdp = current.localDescription?.sdp;
      if (!sdp) throw new Error('Camera preview offer is unavailable.');
      const answer = await messaging
        .sendRuntimeMessage({
          type: VideoMessageType.COUNTDOWN_CAMERA_OFFER,
          recordingId,
          controlToken,
          peerGeneration,
          sdp,
        })
        .finally(() => {
          if (disposed) closeRemote();
        });
      if (disposed) return;
      if (!answer?.success || !answer.sdp) throw new Error('Camera preview is unavailable.');
      await current.setRemoteDescription({ type: 'answer', sdp: answer.sdp });
    };
    void connect().catch(() => {
      if (disposed) return;
      setState({ status: 'error', stream: null });
      cleanup();
    });
    return cleanup;
  }, [webcamDeviceId, recordingId, controlToken, messaging, active]);
  return state;
}

function waitForPreviewIce(peer: RTCPeerConnection, signal: AbortSignal): Promise<void> {
  if (peer.iceGatheringState === 'complete' || signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      peer.removeEventListener('icegatheringstatechange', change);
      signal.removeEventListener('abort', finish);
      resolve();
    };
    const change = () => {
      if (peer.iceGatheringState === 'complete') finish();
    };
    const timer = setTimeout(finish, 3000);
    peer.addEventListener('icegatheringstatechange', change);
    signal.addEventListener('abort', finish, { once: true });
  });
}

function resolvePreviewStatusText(status: PreviewState['status']): string {
  if (status === 'loading') {
    return translate('popup.video.webcamQualityPreviewLoading');
  }
  if (status === 'error') {
    return translate('popup.video.webcamQualityPreviewError');
  }
  return translate('popup.video.activeWebcamPreviewUnavailable');
}
