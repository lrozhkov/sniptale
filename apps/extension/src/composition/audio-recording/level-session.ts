import { useEffect, useState, type RefObject } from 'react';
import { observeMicrophoneLevel } from '@sniptale/platform/browser/user-media';
import { VOICE_INPUT_LEVEL_PEAK_COUNT } from '@sniptale/runtime-contracts/voice-input';
import type { AudioRecordingMeter, AudioRecordingStatus } from './session-types';

const emptyPeaks = Array<number>(VOICE_INPUT_LEVEL_PEAK_COUNT).fill(0);

export function useRecordingLevelSession(
  status: AudioRecordingStatus,
  streamRef: RefObject<MediaStream | null>
): AudioRecordingMeter {
  const [frame, setFrame] = useState<AudioRecordingMeter>({
    status: 'idle',
    level: 0,
    peaks: emptyPeaks,
  });
  useEffect(() => {
    if (status !== 'recording') {
      setFrame({ status: status === 'paused' ? 'paused' : 'idle', level: 0, peaks: emptyPeaks });
      return;
    }
    const track = streamRef.current?.getAudioTracks?.()[0];
    if (!track || track.readyState === 'ended') {
      setFrame({ status: 'unavailable', level: 0, peaks: emptyPeaks });
      return;
    }
    let active = true;
    let monitorAvailable = true;
    const unavailable = () => {
      monitorAvailable = false;
      if (active) setFrame({ status: 'unavailable', level: 0, peaks: emptyPeaks });
    };
    const onMute = () => {
      if (active) setFrame({ status: 'unavailable', level: 0, peaks: emptyPeaks });
    };
    const onUnmute = () => {
      if (active && monitorAvailable)
        setFrame({ status: 'listening', level: 0, peaks: emptyPeaks });
    };
    track.addEventListener?.('mute', onMute);
    track.addEventListener?.('unmute', onUnmute);
    track.addEventListener?.('ended', onMute);
    setFrame({
      status: track.enabled && !track.muted ? 'listening' : 'unavailable',
      level: 0,
      peaks: emptyPeaks,
    });
    let monitor: ReturnType<typeof observeMicrophoneLevel> | undefined;
    try {
      monitor = observeMicrophoneLevel(
        track,
        ({ level, peaks }) => {
          if (!active || !monitorAvailable) return;
          if (!track.enabled || track.muted || track.readyState === 'ended') {
            onMute();
            return;
          }
          setFrame({ status: level >= 0.04 ? 'voice' : 'silence', level, peaks });
        },
        unavailable
      );
    } catch {
      unavailable();
    }
    return () => {
      active = false;
      track.removeEventListener?.('mute', onMute);
      track.removeEventListener?.('unmute', onUnmute);
      track.removeEventListener?.('ended', onMute);
      monitor?.dispose();
    };
  }, [status, streamRef]);
  return frame;
}
