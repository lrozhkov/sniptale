import { useEffect, useState } from 'react';
import {
  buildMicrophoneAudioConstraints,
  pickMicrophoneActualSettings,
} from '@sniptale/runtime-contracts/video/types/microphone-processing';
import type {
  MicrophoneActualSettings,
  VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import {
  createInactiveMediaProbeState,
  stopMediaProbeStream,
  type InactiveMediaProbeState,
} from './media-probe-state';

type MicrophoneProbeState =
  | InactiveMediaProbeState
  | {
      status: 'ready';
      capabilities: MediaTrackCapabilities | null;
      settings: MicrophoneActualSettings;
      stream: MediaStream;
      trackSettings: MediaTrackSettings;
    };

async function requestMicrophoneProbeStream({
  autoGainControl,
  currentDeviceId,
  echoCancellation,
  noiseSuppression,
}: {
  autoGainControl: VideoRecordingSettings['autoGainControl'];
  currentDeviceId: string;
  echoCancellation: VideoRecordingSettings['echoCancellation'];
  noiseSuppression: VideoRecordingSettings['noiseSuppression'];
}): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: buildMicrophoneAudioConstraints({
      microphoneDeviceId: currentDeviceId,
      ...(autoGainControl === undefined ? {} : { autoGainControl }),
      ...(echoCancellation === undefined ? {} : { echoCancellation }),
      ...(noiseSuppression === undefined ? {} : { noiseSuppression }),
    }),
    video: false,
  });
}

function createReadyState(stream: MediaStream): MicrophoneProbeState {
  const [track] = stream.getAudioTracks();
  if (!track) {
    throw new Error('Microphone probe stream has no audio track.');
  }

  const trackSettings = track.getSettings();
  return {
    capabilities: typeof track.getCapabilities === 'function' ? track.getCapabilities() : null,
    settings: pickMicrophoneActualSettings(trackSettings),
    status: 'ready',
    stream,
    trackSettings,
  };
}

function startMicrophoneProbeEffect({
  autoGainControl,
  currentDeviceId,
  echoCancellation,
  noiseSuppression,
  setState,
}: {
  autoGainControl: VideoRecordingSettings['autoGainControl'];
  currentDeviceId: string | null;
  echoCancellation: VideoRecordingSettings['echoCancellation'];
  noiseSuppression: VideoRecordingSettings['noiseSuppression'];
  setState: (state: MicrophoneProbeState) => void;
}): () => void {
  let disposed = false;
  let stream: MediaStream | null = null;

  const openProbe = async () => {
    if (!currentDeviceId) {
      setState(createInactiveMediaProbeState('idle'));
      return;
    }

    setState(createInactiveMediaProbeState('loading'));
    try {
      stream = await requestMicrophoneProbeStream({
        autoGainControl,
        currentDeviceId,
        echoCancellation,
        noiseSuppression,
      });
      if (disposed) {
        stopMediaProbeStream(stream);
        return;
      }
      setState(createReadyState(stream));
    } catch {
      stopMediaProbeStream(stream);
      if (!disposed) {
        setState(createInactiveMediaProbeState('error'));
      }
    }
  };

  void openProbe();
  return () => {
    disposed = true;
    stopMediaProbeStream(stream);
  };
}

export function useMicrophoneProbe({
  currentDeviceId,
  settings,
}: {
  currentDeviceId: string | null;
  settings: VideoRecordingSettings;
}): MicrophoneProbeState {
  const [state, setState] = useState<MicrophoneProbeState>(createInactiveMediaProbeState('idle'));
  const { autoGainControl, echoCancellation, noiseSuppression } = settings;

  useEffect(
    () =>
      startMicrophoneProbeEffect({
        autoGainControl,
        currentDeviceId,
        echoCancellation,
        noiseSuppression,
        setState,
      }),
    [autoGainControl, currentDeviceId, echoCancellation, noiseSuppression]
  );

  return state;
}
