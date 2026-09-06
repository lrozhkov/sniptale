import { useEffect, useRef, useState } from 'react';
import type { ReviewEdit } from '../../features/video/review/types';
import { nearestReviewBoundary, reviewPlaybackSettings } from '../../features/video/review/cuts';

/** Owns source-time playback and restores sound/rate when leaving an edited interval. */
export function useReviewPlayback(props: {
  duration: number;
  edits: readonly ReviewEdit[];
  boundaries(): readonly number[] | undefined;
  onSeek(value: number): void;
  onFailure(): void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const latest = useRef(props);
  latest.current = props;
  const synchronize = (value: number, applyEdits: boolean) => {
    const node = video.current;
    const settings = reviewPlaybackSettings(value, latest.current.edits);
    const next = applyEdits ? settings.time : value;
    if (node) {
      if (next !== value) node.currentTime = next;
      node.playbackRate = settings.rate;
      node.preservesPitch = false;
      node.muted = settings.muted;
      if (next >= latest.current.duration) node.pause();
    }
    setTime(next);
    return next;
  };
  const tick = useRef(synchronize);
  tick.current = synchronize;
  useEffect(() => {
    if (video.current) video.current.volume = volume;
  }, [volume]);
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const advance = () => {
      const node = video.current;
      if (node && !node.paused) tick.current(node.currentTime, true);
      frame = requestAnimationFrame(advance);
    };
    frame = requestAnimationFrame(advance);
    return () => cancelAnimationFrame(frame);
  }, [playing]);
  return {
    video,
    time,
    playing,
    setPlaying,
    volume,
    setVolume,
    onTime: (value: number) => synchronize(value, playing),
    seek: (value: number, snap = true) => {
      const clamped = Math.max(0, Math.min(props.duration, value));
      const boundaries = snap ? props.boundaries() : undefined;
      const next = boundaries ? nearestReviewBoundary(clamped, boundaries) : clamped;
      if (video.current) video.current.currentTime = next;
      synchronize(next, false);
      props.onSeek(next);
    },
    play: () => {
      const node = video.current;
      if (!node) return;
      if (node.paused) {
        if (node.currentTime >= props.duration) node.currentTime = 0;
        synchronize(node.currentTime, true);
        if (node.currentTime >= props.duration) return;
        void node.play().catch(props.onFailure);
      } else node.pause();
    },
  };
}
