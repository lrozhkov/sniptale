import { useRef, useState, type VideoHTMLAttributes } from 'react';

/** Maps HTML media events to the player state for one mounted video element. */
export function useVideoMediaState() {
  const video = useRef<HTMLVideoElement>(null);
  const probe = useRef(false);
  const [duration, setDuration] = useState(0);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [buffering, setBuffering] = useState(false);
  const [error, setError] = useState<'media' | 'action' | null>(null);
  const ready = duration > 0 && error !== 'media';

  const readDuration = (element: HTMLVideoElement) => {
    if (!Number.isFinite(element.duration) || element.duration <= 0) return;
    if (probe.current) {
      probe.current = false;
      element.currentTime = 0;
    }
    setDuration(element.duration);
  };
  const mediaEvents: VideoHTMLAttributes<HTMLVideoElement> = {
    onLoadedMetadata: (event) => {
      const element = event.currentTarget;
      if (!Number.isFinite(element.duration) || element.duration <= 0) {
        probe.current = true;
        element.currentTime = Number.MAX_SAFE_INTEGER;
      } else readDuration(element);
    },
    onDurationChange: (event) => readDuration(event.currentTarget),
    onTimeUpdate: (event) => {
      if (!probe.current) setTime(event.currentTarget.currentTime);
    },
    onPlay: () => setPlaying(true),
    onPlaying: () => setBuffering(false),
    onWaiting: () => setBuffering(true),
    onPause: () => setPlaying(false),
    onEnded: () => {
      setPlaying(false);
      setBuffering(false);
    },
    onVolumeChange: (event) => {
      setVolume(event.currentTarget.volume);
      setMuted(event.currentTarget.muted);
    },
    onRateChange: (event) => setSpeed(event.currentTarget.playbackRate),
    onError: () => setError('media'),
  };
  return {
    video,
    mediaEvents,
    duration,
    time,
    playing,
    volume,
    muted,
    speed,
    buffering,
    error,
    ready,
    setError,
    setTime,
  };
}
