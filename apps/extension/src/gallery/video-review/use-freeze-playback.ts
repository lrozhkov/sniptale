import { retimeReviewResultRange } from '../../features/video/review/timeline-placement';
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { buildReviewTimeMap, sourceToReviewResult } from '../../features/video/review/timeline';
import type { ReviewEdit } from '../../features/video/review/types';
import type { ReviewPlaybackRange } from './playback-range';
import {
  REVIEW_PLAYBACK_UI_INTERVAL_MS,
  type ReviewPlaybackPresentationClock,
} from './playback-presentation-clock';

interface SourcePlayback {
  video: RefObject<HTMLVideoElement | null>;
  playbackRange: ReviewPlaybackRange | null;
  setPlaybackRange(range: ReviewPlaybackRange | null): void;
  playing: boolean;
  time: number;
  setPlaying(value: boolean): void;
  seek(time: number, snap?: boolean): void;
  onTime(time: number): number;
  onEnded(): void;
  onMediaError(): void;
  play(): void;
  playheadClock?: ReviewPlaybackPresentationClock;
  onPresentedTime?(identity: string, time: number): void;
  cancelPendingPlay?(): void;
}
type Segment = ReturnType<typeof buildReviewTimeMap>[number];
interface Hold {
  segment: Segment;
  elapsed: number;
  started: number | null;
}

/** Inserted time has a project clock; it never advances or loops the physical source element. */
export function useReviewFreezePlayback<Playback extends SourcePlayback>(
  base: Playback,
  edits: readonly ReviewEdit[],
  duration: number
) {
  const latest = useRef(base);
  latest.current = base;
  const playingIntent = useRef(base.playing);
  playingIntent.current = base.playing;
  const segments = useMemo(() => buildReviewTimeMap(duration, edits), [duration, edits]);
  const holds = useMemo(() => segments.filter((part) => part.kind === 'freeze'), [segments]);
  const [resultRange, setResultRange] = useState<ReviewPlaybackRange | null>(null);
  const rangeRef = useRef(resultRange);
  rangeRef.current = resultRange;
  const previousSegments = useRef(segments);
  useEffect(() => {
    const before = previousSegments.current;
    previousSegments.current = segments;
    if (before === segments) return;
    setResultRange((current) => {
      if (!current?.result) return current;
      const result = retimeReviewResultRange(current.result, before, segments);
      if (result.end - result.start < 0.05 - 1e-9) return null;
      const sourceAt = (time: number, end = false) => {
        const part = segments.find(
          (item) =>
            item.kind !== 'cut' &&
            (end
              ? time > item.resultStart && time <= item.resultEnd
              : time >= item.resultStart && time < item.resultEnd)
        );
        return part ? part.sourceStart + (time - part.resultStart) * part.rate : duration;
      };
      return { start: sourceAt(result.start), end: sourceAt(result.end, true), result };
    });
  }, [segments, duration]);
  const active = useRef<Hold | null>(null);
  const played = useRef(new Set<string>());
  const previousSource = useRef<number | null>(null);
  const presentationFloor = useRef<number | null>(null);
  const clockListeners = useRef(new Set<() => void>());
  const [, refresh] = useState(0);
  const elapsed = useCallback(
    (hold: Hold) =>
      Math.min(
        hold.segment.resultEnd - hold.segment.resultStart,
        hold.elapsed + (hold.started === null ? 0 : (performance.now() - hold.started) / 1000)
      ),
    []
  );
  const readResultTime = useCallback(() => {
    const hold = active.current;
    if (hold) return hold.segment.resultStart + elapsed(hold);
    const source = latest.current.video.current?.currentTime ?? latest.current.time;
    const from = previousSource.current ?? source;
    // A native frame can cross the insertion before the hold's animation-frame callback runs.
    const pending = holds.find(
      (part) =>
        !played.current.has(part.freezeId!) &&
        part.sourceStart >= from &&
        part.sourceStart <= source
    );
    return pending?.resultStart ?? null;
  }, [elapsed, holds]);
  const playheadClock = useMemo(() => {
    const sourceClock = base.playheadClock;
    if (!sourceClock) return undefined;
    const sourceTime = () =>
      Math.max(
        presentationFloor.current ?? 0,
        latest.current.video.current?.currentTime ?? sourceClock.read()
      );
    return {
      read: () => active.current?.segment.sourceStart ?? sourceTime(),
      readResult: () => readResultTime() ?? sourceToReviewResult(sourceTime(), segments) ?? 0,
      isPlaying: () =>
        playingIntent.current ||
        !!(
          latest.current.video.current &&
          !latest.current.video.current.paused &&
          !latest.current.video.current.error
        ),
      subscribe(listener: () => void) {
        clockListeners.current.add(listener);
        const unsubscribe = sourceClock.subscribe(listener);
        return () => {
          clockListeners.current.delete(listener);
          unsubscribe();
        };
      },
    };
  }, [base.playheadClock, readResultTime, segments]);
  const pause = useCallback(() => {
    playingIntent.current = false;
    latest.current.cancelPendingPlay?.();
    const hold = active.current;
    if (hold) {
      hold.elapsed = elapsed(hold);
      hold.started = null;
    }
    latest.current.video.current?.pause();
    latest.current.setPlaying(false);
    refresh((value) => value + 1);
  }, [elapsed]);
  const enter = useCallback((segment: Segment, offset = 0, playing = true) => {
    const node = latest.current.video.current;
    if (!node) return;
    playingIntent.current = playing;
    active.current = { segment, elapsed: offset, started: null };
    played.current.add(segment.freezeId!);
    node.pause();
    latest.current.onTime(segment.sourceStart);
    node.currentTime = segment.frameTime!;
    latest.current.setPlaying(playing);
    refresh((value) => value + 1);
  }, []);
  const seek = useCallback(
    (time: number, snap = true) => {
      const range = rangeRef.current?.result;
      const result = sourceToReviewResult(time, segments);
      if (range && (result === null || result < range.start || result >= range.end)) {
        rangeRef.current = null;
        setResultRange(null);
      }
      active.current = null;
      presentationFloor.current = null;
      played.current = new Set(
        holds.filter((hold) => hold.sourceStart <= time).map((hold) => hold.freezeId!)
      );
      previousSource.current = time;
      latest.current.seek(time, snap);
      refresh((value) => value + 1);
    },
    [holds, segments]
  );
  const seekResult = useCallback(
    (time: number) => {
      const range = rangeRef.current?.result;
      if (range && (time < range.start || time >= range.end)) {
        rangeRef.current = null;
        setResultRange(null);
      }
      const part = segments.find(
        (part) => part.kind !== 'cut' && time >= part.resultStart && time < part.resultEnd
      );
      if (part?.kind !== 'freeze') {
        const resumeSource = !!active.current && playingIntent.current;
        if (part) seek(part.sourceStart + (time - part.resultStart) * part.rate, false);
        else if (time >= (segments.at(-1)?.resultEnd ?? 0)) seek(duration, false);
        if (resumeSource) latest.current.play();
        return;
      }
      const playing = playingIntent.current;
      pause();
      latest.current.seek(part.sourceStart, false);
      played.current = new Set(
        holds.filter((hold) => hold.resultEnd <= part.resultStart).map((hold) => hold.freezeId!)
      );
      enter(part, time - part.resultStart, playing);
    },
    [duration, enter, holds, pause, seek, segments]
  );
  useEffect(() => {
    if (!base.playbackRange) return;
    played.current = new Set(active.current ? [active.current.segment.freezeId!] : []);
    previousSource.current = active.current?.segment.sourceStart ?? base.playbackRange.start;
  }, [base.playbackRange]);
  useEffect(() => {
    const hold = active.current;
    if (!hold) return;
    const next = holds.find((part) => part.freezeId === hold.segment.freezeId);
    if (!next) {
      const source = hold.segment.sourceStart;
      active.current = null;
      pause();
      latest.current.seek(source, false);
    } else hold.segment = next;
  }, [holds, pause]);
  useEffect(() => {
    if (!base.playing || (!holds.length && !resultRange)) return;
    let frame = 0;
    let lastPublish = 0;
    const tick = () => {
      if (!playingIntent.current) return;
      const current = latest.current;
      const node = current.video.current;
      if (!node) return;
      const now = performance.now();
      const selected = rangeRef.current?.result;
      const result = readResultTime() ?? sourceToReviewResult(node.currentTime, segments);
      if (
        selected &&
        result !== null &&
        (result < selected.start - 1e-7 || result >= selected.end)
      ) {
        seekResult(selected.start);
        frame = requestAnimationFrame(tick);
        return;
      }
      const hold = active.current;
      if (hold) {
        if (hold.started === null && !node.seeking && node.readyState >= 2) hold.started = now;
        if (elapsed(hold) >= hold.segment.resultEnd - hold.segment.resultStart) {
          const next = holds.find((part) => part.resultStart === hold.segment.resultEnd);
          if (next) enter(next);
          else {
            presentationFloor.current = hold.segment.sourceStart;
            current.onTime(hold.segment.sourceStart);
            active.current = null;
            previousSource.current = hold.segment.sourceStart;
            node.currentTime = hold.segment.sourceStart;
            if (node.currentTime >= duration) current.onEnded();
            else void node.play().catch(() => current.onMediaError());
            refresh((value) => value + 1);
          }
        } else if (now - lastPublish >= REVIEW_PLAYBACK_UI_INTERVAL_MS) {
          lastPublish = now;
          refresh((value) => value + 1);
        }
      } else {
        const source = node.currentTime;
        if (previousSource.current !== null && source < previousSource.current - 0.1) {
          played.current.clear();
          previousSource.current = source;
        }
        const from = previousSource.current ?? source;
        const next = holds.find(
          (part) =>
            !played.current.has(part.freezeId!) &&
            part.sourceStart >= from &&
            part.sourceStart <= source &&
            (!current.playbackRange || part.sourceStart < current.playbackRange.end)
        );
        previousSource.current = source;
        if (next) enter(next);
      }
      for (const listener of clockListeners.current) listener();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [
    base.playing,
    duration,
    elapsed,
    enter,
    holds,
    resultRange,
    readResultTime,
    seekResult,
    segments,
  ]);
  useEffect(
    () => () => {
      active.current = null;
    },
    []
  );
  const onPresentedTime = useCallback((identity: string, time: number) => {
    if (
      active.current ||
      (presentationFloor.current !== null && time < presentationFloor.current - 1e-7)
    )
      return;
    latest.current.onPresentedTime?.(identity, Math.max(presentationFloor.current ?? 0, time));
  }, []);
  const hold = active.current;
  return {
    ...base,
    ...(playheadClock ? { playheadClock } : {}),
    playbackRange: resultRange ?? base.playbackRange,
    setPlaybackRange: (range: ReviewPlaybackRange | null) => {
      if (!range?.result) {
        rangeRef.current = null;
        setResultRange(null);
        base.setPlaybackRange(range);
        return;
      }
      if (range.result.end - range.result.start < 0.05 - 1e-9) return;
      base.setPlaybackRange(null);
      rangeRef.current = range;
      setResultRange(range);
      pause();
      seekResult(range.result.start);
    },
    pause,
    seek,
    seekResult,
    readResultTime,
    heldResultTime: readResultTime(),
    time: hold?.segment.sourceStart ?? Math.max(presentationFloor.current ?? 0, base.time),
    onTime: (time: number) =>
      active.current?.segment.sourceStart ??
      base.onTime(Math.max(presentationFloor.current ?? 0, time)),
    onPresentedTime,
    setPlaying: (playing: boolean) => {
      if (!playing && (active.current || base.video.current?.paused === false)) return;
      if (playing && base.video.current?.paused === true) return;
      playingIntent.current = playing;
      base.setPlaying(playing);
    },
    onMediaError: () => {
      pause();
      active.current = null;
      base.onMediaError();
    },
    onEnded: () => {
      if (rangeRef.current?.result) {
        seekResult(rangeRef.current.result.start);
        base.setPlaying(true);
        if (!active.current && base.video.current?.paused) base.play();
        return;
      }
      const next = holds.find(
        (part) => part.sourceStart === duration && !played.current.has(part.freezeId!)
      );
      if (next) enter(next);
      else base.onEnded();
    },
    play: () => {
      const hold = active.current;
      if (!hold) {
        previousSource.current = base.video.current?.currentTime ?? null;
        if (base.video.current && base.video.current.currentTime >= duration) {
          played.current.clear();
          presentationFloor.current = null;
        }
        return base.play();
      }
      if (playingIntent.current) pause();
      else {
        playingIntent.current = true;
        hold.started = null;
        base.setPlaying(true);
        refresh((value) => value + 1);
      }
    },
  };
}
