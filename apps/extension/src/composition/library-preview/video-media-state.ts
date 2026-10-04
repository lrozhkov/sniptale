import { useEffect, useRef, useState, type VideoHTMLAttributes } from 'react';

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

  useEffect(() => {
    if (!playing || buffering || !ready) return;
    let frame = 0;
    const updatePosition = () => {
      const element = video.current;
      if (!element || element.paused || element.ended) return;
      if (!element.seeking && !probe.current)
        setTime(Math.max(0, Math.min(duration, element.currentTime)));
      frame = requestAnimationFrame(updatePosition);
    };
    frame = requestAnimationFrame(updatePosition);
    return () => cancelAnimationFrame(frame);
  }, [playing, buffering, ready, duration]);

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
    onWaiting: (event) => {
      if (!probe.current) setTime(event.currentTarget.currentTime);
      setBuffering(true);
    },
    onPause: (event) => {
      if (!probe.current) setTime(event.currentTarget.currentTime);
      setPlaying(false);
    },
    onEnded: (event) => {
      if (!probe.current) setTime(event.currentTarget.currentTime);
      setPlaying(false);
      setBuffering(false);
    },
    onSeeking: (event) => {
      if (!probe.current) setTime(event.currentTarget.currentTime);
    },
    onSeeked: (event) => {
      if (!probe.current) setTime(event.currentTarget.currentTime);
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
