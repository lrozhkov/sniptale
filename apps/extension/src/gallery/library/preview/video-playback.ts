import { useState } from 'react';
import { useVideoFullscreen } from './video-fullscreen';
import { useVideoMediaState } from './video-media-state';

/** Owns playback events and commands for one mounted source. */
export function useVideoPlayer() {
  const {
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
  } = useVideoMediaState();
  const [fit, setFit] = useState(true);
  const [pending, setPending] = useState(false);
  const { container, fullscreenButton, fullscreen, toggleFullscreen } = useVideoFullscreen({
    pending,
    setPending,
    setError,
  });

  const togglePlayback = async () => {
    if (!video.current || pending || !ready) return;
    setError((current) => (current === 'media' ? current : null));
    if (!video.current.paused) {
      video.current.pause();
      return;
    }
    setPending(true);
    try {
      await video.current.play();
    } catch {
      setError((current) => (current === 'media' ? current : 'action'));
    } finally {
      setPending(false);
    }
  };
  const seek = (value: number) => {
    if (!video.current || !ready || !Number.isFinite(value)) return;
    video.current.currentTime = Math.max(0, Math.min(duration, value));
    setTime(video.current.currentTime);
  };

  return {
    video,
    mediaEvents,
    container,
    fullscreenButton,
    duration,
    time,
    playing,
    volume,
    muted,
    speed,
    fit,
    fullscreen,
    pending,
    buffering,
    error,
    ready,
    setFit,
    togglePlayback,
    toggleFullscreen,
    seek,
  };
}
