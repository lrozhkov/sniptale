import {
  createReviewPlaybackRange,
  reviewPlaybackRangeStart,
  resolveReviewPlaybackSample,
  type ReviewPlaybackRange,
} from './playback-range';
import {
  originalAudioGainAt,
  type OriginalAudioAttenuation,
} from '../../features/video/review/advanced/original-audio';
import { useEffect, useRef, useState } from 'react';
import type { ReviewEdit } from '../../features/video/review/types';
import type { QuickEditOriginalAudio } from '../../features/video/review/advanced/types';
import { nearestReviewBoundary } from '../../features/video/review/cuts';

interface ReviewPlaybackProps {
  duration: number;
  edits: readonly ReviewEdit[];
  boundaries(): readonly number[] | undefined;
  onSeek(value: number): void;
  onFailure(): void;
  onInvalidRange?: (() => void) | undefined;
  original: QuickEditOriginalAudio;
  automaticOriginalRanges?: readonly OriginalAudioAttenuation[];
  silent?: boolean;
  retainCutTime?: boolean;
}

/** Owns source-time playback; the persisted original-audio gate and rate live here. */
export function useReviewPlayback(props: ReviewPlaybackProps) {
  const video = useRef<HTMLVideoElement>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [playbackRange, updateRange] = useState<ReviewPlaybackRange | null>(null);
  const rangeRef = useRef(playbackRange);
  const [seekRevision, reviseSeek] = useState(0);
  const setRange = (range: ReviewPlaybackRange | null) => {
    rangeRef.current = range;
    updateRange(range);
  };
  const latest = useRef(props);
  latest.current = props;
  const synchronize = (value: number, applyEdits: boolean) => {
    const node = video.current;
    const effective = resolveReviewPlaybackSample({
      time: value,
      applyEdits,
      duration: latest.current.duration,
      edits: latest.current.edits,
      retainCutTime: latest.current.retainCutTime ?? false,
      range: rangeRef.current,
    });
    const next = effective.time;
    if (effective.looped) reviseSeek((revision) => revision + 1);
    if (node) applyReviewPlaybackSample(node, effective, value, latest.current);
    setTime(next);
    return next;
  };
  const audioSettingsKey = JSON.stringify([
    props.original,
    props.automaticOriginalRanges,
    props.edits,
    props.silent,
    props.retainCutTime,
  ]);
  const tick = useRef(synchronize);
  tick.current = synchronize;
  useEffect(() => {
    const range = rangeRef.current;
    if (range) {
      const normalized = createReviewPlaybackRange(range.start, range.end, props.duration);
      if (!normalized || reviewPlaybackRangeStart(normalized, latest.current.edits) === null) {
        setRange(null);
        video.current?.pause();
        setPlaying(false);
      } else if (normalized.start !== range.start || normalized.end !== range.end)
        setRange(normalized);
    }
    const node = video.current;
    if (node) tick.current(node.currentTime, false);
  }, [audioSettingsKey, props.duration]);
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
    playbackRange,
    seekRevision,
    setPlaybackRange: (requested: ReviewPlaybackRange | null) => {
      if (!requested) {
        setRange(null);
        return;
      }
      const range = createReviewPlaybackRange(requested.start, requested.end, props.duration);
      if (!range) return;
      const start = reviewPlaybackRangeStart(range, props.edits);
      if (start === null) {
        props.onInvalidRange?.();
        return;
      }
      setRange(range);
      if (video.current) video.current.currentTime = start;
      reviseSeek((revision) => revision + 1);
      synchronize(start, false);
      props.onSeek(start);
    },
    onEnded: () => {
      const range = props.retainCutTime ? null : rangeRef.current;
      const start = range && reviewPlaybackRangeStart(range, props.edits);
      if (range && start !== null && video.current) {
        video.current.currentTime = start;
        reviseSeek((revision) => revision + 1);
        synchronize(start, true);
        void video.current.play().catch(props.onFailure);
      } else setPlaying(false);
    },
    onTime: (value: number) => synchronize(value, playing),
    seek: (value: number, snap = true) => {
      const clamped = Math.max(0, Math.min(props.duration, value));
      const boundaries = snap ? props.boundaries() : undefined;
      const next = boundaries ? nearestReviewBoundary(clamped, boundaries) : clamped;
      const range = rangeRef.current;
      if (range && !props.retainCutTime && (next < range.start || next >= range.end))
        setRange(null);
      if (video.current) video.current.currentTime = next;
      reviseSeek((revision) => revision + 1);
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

/** Applies the resolved source sample and authored audio settings to the native element. */
function applyReviewPlaybackSample(
  node: HTMLVideoElement,
  sample: ReturnType<typeof resolveReviewPlaybackSample>,
  previousTime: number,
  props: ReviewPlaybackProps
) {
  if (sample.time !== previousTime) node.currentTime = sample.time;
  if (node.playbackRate !== sample.rate) node.playbackRate = sample.rate;
  if (node.preservesPitch !== true) node.preservesPitch = true;
  const gain = originalAudioGainAt(
    props.original,
    sample.time,
    props.edits,
    props.automaticOriginalRanges
  );
  const muted = props.silent || sample.muted || gain === 0;
  if (node.muted !== muted) node.muted = muted;
  // The element caps at one; the preview audio graph amplifies beyond it.
  const volume = Math.min(1, gain);
  if (node.volume !== volume) node.volume = volume;
  if (sample.time >= props.duration) node.pause();
}
