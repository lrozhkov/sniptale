import { useEffect, useRef, useState } from 'react';
import type { ReviewEdit } from '../../features/video/review/types';
import type { QuickEditOriginalAudio } from '../../features/video/review/advanced/types';
import { nearestReviewBoundary, reviewPlaybackSettings } from '../../features/video/review/cuts';

/** Owns source-time playback; the persisted original-audio gate and rate live here. */
export function useReviewPlayback(props: {
  duration: number;
  edits: readonly ReviewEdit[];
  boundaries(): readonly number[] | undefined;
  onSeek(value: number): void;
  onFailure(): void;
  original: QuickEditOriginalAudio;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
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
      node.muted = settings.muted || latest.current.original.muted;
      // The element caps at one; the preview audio graph amplifies beyond it.
      node.volume = Math.min(1, latest.current.original.volume);
      if (next >= latest.current.duration) node.pause();
    }
    setTime(next);
    return next;
  };
  const tick = useRef(synchronize);
  tick.current = synchronize;
  useEffect(() => {
    const node = video.current;
    if (node) tick.current(node.currentTime, false);
  }, [props.original.volume, props.original.muted]);
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
