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
    // Media clocks quantize seeks to microseconds. Round cut destinations forward
    // so truncation cannot land inside the same cut and seek on every frame.
    const next =
      applyEdits && settings.time !== value
        ? Math.min(latest.current.duration, cutSeekTarget(settings.time))
        : value;
    if (node) {
      if (next !== value) node.currentTime = next;
      if (node.playbackRate !== settings.rate) node.playbackRate = settings.rate;
      if (node.preservesPitch !== false) node.preservesPitch = false;
      const muted = settings.muted || latest.current.original.muted;
      if (node.muted !== muted) node.muted = muted;
      // The element caps at one; the preview audio graph amplifies beyond it.
      const volume = Math.min(1, latest.current.original.volume);
      if (node.volume !== volume) node.volume = volume;
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

/** Account for binary floating-point truncation when Chromium converts seconds to microseconds. */
function cutSeekTarget(time: number): number {
  const rounded = Math.ceil(time * 1e6) / 1e6;
  return Math.floor(rounded * 1e6) / 1e6 < time ? rounded + 1e-6 : rounded;
}
