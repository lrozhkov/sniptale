import { useEffect, useState } from 'react';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import {
  VideoRecordingStatus,
  type VideoRecordingRuntimeState,
} from '@sniptale/runtime-contracts/video/types/types';
import { MediaStreamVideo } from '../../../../features/video/recording/media-stream-video';
import { translate } from '../../../../platform/i18n/popup';
import { getPopupRuntimeServices } from '../../../runtime-services';
import type { VideoActiveMediaSelection } from './media-status';

const ICE_GATHERING_TIMEOUT_MS = 3_000;
let nextPeerGeneration = 0;

type CountdownReadinessProps = {
  activeRecordingId?: string | null;
  recordingState: VideoRecordingRuntimeState;
  selection: VideoActiveMediaSelection;
};

export function VideoCountdownReadiness(props: CountdownReadinessProps) {
  const { recordingState, selection } = props;
  const enabled = recordingState.status === VideoRecordingStatus.COUNTDOWN;
  const cameraEnabled = enabled && selection.webcamEnabled;
  const camera = useCountdownCameraPreview({
    activeRecordingId: props.activeRecordingId ?? null,
    cameraEnabled,
    countdownEndsAt: recordingState.countdownEndsAt,
    webcamDeviceId: selection.webcamDeviceId,
  });

  if (!enabled || (!selection.microphoneEnabled && !selection.webcamEnabled)) {
    return null;
  }

  return (
    <div className="flex min-w-0 flex-col justify-center gap-2">
      {cameraEnabled ? (
        <div
          data-ui="popup.video-active.countdown-camera-preview"
          aria-label={translate('popup.video.countdownCameraPreview')}
          className={[
            'flex h-20 items-center justify-center overflow-hidden rounded-[7px]',
            'bg-[var(--sniptale-color-surface-canvas)]',
          ].join(' ')}
        >
          {camera.stream ? (
            <MediaStreamVideo stream={camera.stream} />
          ) : (
            <span className="px-2 text-center text-[11px] text-[var(--sniptale-color-text-muted-strong)]">
              {translate(
                camera.unavailable
                  ? 'popup.video.countdownCameraUnavailable'
                  : 'popup.video.countdownCameraLoading'
              )}
            </span>
          )}
        </div>
      ) : null}
      {selection.microphoneEnabled ? <CountdownMicrophoneMeter state={recordingState} /> : null}
    </div>
  );
}

function CountdownMicrophoneMeter({ state }: { state: VideoRecordingRuntimeState }) {
  const activity = state.microphoneActivity;
  const ready = activity?.status === 'ready';
  const level = ready ? Math.round(Math.max(0, Math.min(1, activity.level)) * 100) : 0;
  return (
    <div className="min-w-0">
      <div className="mb-1 text-[11px] text-[var(--sniptale-color-text-muted-strong)]">
        {translate('popup.video.countdownMicrophoneLevel')}
      </div>
      {ready ? (
        <div
          role="meter"
          data-ui="popup.video-active.microphone-meter"
          aria-label={translate('popup.video.countdownMicrophoneLevel')}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={level}
          className="h-1.5 overflow-hidden rounded-full bg-[var(--sniptale-color-border-soft)]"
        >
          <div
            className="h-full bg-[var(--sniptale-color-accent)]"
            style={{ width: `${level}%` }}
          />
        </div>
      ) : (
        <p className="text-[11px] text-[var(--sniptale-color-text-muted-strong)]">
          {translate('popup.video.countdownMicrophoneUnavailable')}
        </p>
      )}
    </div>
  );
}

function useCountdownCameraPreview({
  activeRecordingId,
  cameraEnabled,
  countdownEndsAt,
  webcamDeviceId,
}: {
  activeRecordingId: string | null;
  cameraEnabled: boolean;
  countdownEndsAt: number | null;
  webcamDeviceId: string | null;
}) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    setStream(null);
    setUnavailable(false);
    if (!cameraEnabled) return;

    let active = true;
    let peer: RTCPeerConnection | null = null;
    let capability: { controlToken: string; recordingId: string } | null = null;
    const peerGeneration = ++nextPeerGeneration;
    const remoteTracks = new Set<MediaStreamTrack>();
    const cancellation = new AbortController();
    const messaging = getPopupRuntimeServices().messaging;
    const closeRemote = () => {
      if (!capability) return;
      void messaging
        .sendRuntimeMessage({
          type: VideoMessageType.COUNTDOWN_CAMERA_CLOSE,
          ...capability,
          peerGeneration,
        })
        .catch(() => undefined);
    };
    const dispose = () => {
      active = false;
      cancellation.abort();
      peer?.close();
      for (const track of remoteTracks) track.stop();
      remoteTracks.clear();
      closeRemote();
    };
    const fail = () => {
      if (!active) return;
      setUnavailable(true);
      setStream(null);
      dispose();
    };

    const connect = async () => {
      const response = await messaging.sendRuntimeMessage({
        type: VideoMessageType.GET_RECORDING_STATE,
      });
      if (!active) return;
      if (
        !response?.success ||
        !response.controlToken ||
        !response.recordingId ||
        response.state?.status !== VideoRecordingStatus.COUNTDOWN ||
        (activeRecordingId !== null && response.recordingId !== activeRecordingId) ||
        (countdownEndsAt !== null && response.state.countdownEndsAt !== countdownEndsAt)
      ) {
        fail();
        return;
      }
      capability = { controlToken: response.controlToken, recordingId: response.recordingId };
      peer = new RTCPeerConnection();
      const currentPeer = peer;
      currentPeer.addTransceiver('video', { direction: 'recvonly' });
      currentPeer.ontrack = (event) => {
        if (!active || event.track.kind !== 'video') {
          event.track.stop();
          return;
        }
        remoteTracks.add(event.track);
        setStream(new MediaStream([event.track]));
      };
      currentPeer.onconnectionstatechange = () => {
        if (currentPeer.connectionState === 'failed') fail();
      };
      const offer = await currentPeer.createOffer();
      if (!active) return;
      await currentPeer.setLocalDescription(offer);
      await waitForIceGathering(currentPeer, cancellation.signal);
      if (!active) return;
      const sdp = currentPeer.localDescription?.sdp;
      if (!sdp) {
        fail();
        return;
      }
      const answer = await messaging
        .sendRuntimeMessage({
          type: VideoMessageType.COUNTDOWN_CAMERA_OFFER,
          ...capability,
          peerGeneration,
          sdp,
        })
        .finally(() => {
          if (!active) closeRemote();
        });
      if (!active) {
        return;
      }
      if (!answer?.success || !answer.sdp) {
        fail();
        return;
      }
      await currentPeer.setRemoteDescription({ type: 'answer', sdp: answer.sdp });
      if (!active) closeRemote();
    };
    void connect().catch(fail);
    return dispose;
  }, [activeRecordingId, cameraEnabled, countdownEndsAt, webcamDeviceId]);

  return { stream, unavailable };
}

function waitForIceGathering(peer: RTCPeerConnection, signal: AbortSignal): Promise<void> {
  if (peer.iceGatheringState === 'complete' || signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const finish = () => {
      window.clearTimeout(timeout);
      peer.removeEventListener('icegatheringstatechange', onStateChange);
      signal.removeEventListener('abort', finish);
      resolve();
    };
    const onStateChange = () => {
      if (peer.iceGatheringState === 'complete') finish();
    };
    const timeout = window.setTimeout(finish, ICE_GATHERING_TIMEOUT_MS);
    peer.addEventListener('icegatheringstatechange', onStateChange);
    signal.addEventListener('abort', finish, { once: true });
  });
}
