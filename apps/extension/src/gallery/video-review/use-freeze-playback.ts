import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildReviewTimeMap } from '../../features/video/review/timeline';
import type { ReviewEdit } from '../../features/video/review/types';
import type { useReviewSourcePlayback } from './use-playback';

type SourcePlayback = ReturnType<typeof useReviewSourcePlayback>;
type Segment = ReturnType<typeof buildReviewTimeMap>[number];
interface Hold {
  segment: Segment;
  elapsed: number;
  started: number | null;
}

/** Inserted time has a project clock; it never advances or loops the physical source element. */
export function useReviewFreezePlayback(
  base: SourcePlayback,
  edits: readonly ReviewEdit[],
  duration: number
) {
  const latest = useRef(base);
  latest.current = base;
  const segments = useMemo(() => buildReviewTimeMap(duration, edits), [duration, edits]);
  const holds = useMemo(() => segments.filter((part) => part.kind === 'freeze'), [segments]);
  const active = useRef<Hold | null>(null);
  const played = useRef(new Set<string>());
  const previousSource = useRef<number | null>(null);
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
    return hold ? hold.segment.resultStart + elapsed(hold) : null;
  }, [elapsed]);
  const pause = useCallback(() => {
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
    active.current = { segment, elapsed: offset, started: null };
    played.current.add(segment.freezeId!);
    node.pause();
    node.currentTime = segment.frameTime!;
    latest.current.setPlaying(playing);
    refresh((value) => value + 1);
  }, []);
  const seek = useCallback(
    (time: number, snap = true) => {
      active.current = null;
      played.current = new Set(
        holds.filter((hold) => hold.sourceStart <= time).map((hold) => hold.freezeId!)
      );
      previousSource.current = time;
      latest.current.seek(time, snap);
      refresh((value) => value + 1);
    },
    [holds]
  );
  const seekResult = useCallback(
    (time: number) => {
      const part = segments.find(
        (part) => part.kind !== 'cut' && time >= part.resultStart && time < part.resultEnd
      );
      if (part?.kind !== 'freeze') {
        if (part) seek(part.sourceStart + (time - part.resultStart) * part.rate, false);
        else if (time >= (segments.at(-1)?.resultEnd ?? 0)) seek(duration, false);
        return;
      }
      const playing = latest.current.playing;
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
    if (!base.playing || !holds.length) return;
    let frame = 0;
    let lastPublish = 0;
    const tick = () => {
      const current = latest.current;
      const node = current.video.current;
      if (!node) return;
      const now = performance.now();
      const hold = active.current;
      if (hold) {
        if (hold.started === null && !node.seeking && node.readyState >= 2) hold.started = now;
        if (elapsed(hold) >= hold.segment.resultEnd - hold.segment.resultStart) {
          const next = holds.find((part) => part.resultStart === hold.segment.resultEnd);
          if (next) enter(next);
          else {
            active.current = null;
            previousSource.current = hold.segment.sourceStart;
            node.currentTime = hold.segment.sourceStart;
            if (node.currentTime >= duration) current.onEnded();
            else void node.play().catch(() => current.onMediaError());
            refresh((value) => value + 1);
          }
        } else if (now - lastPublish >= 30) {
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
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [base.playing, duration, elapsed, enter, holds]);
  useEffect(
    () => () => {
      active.current = null;
    },
    []
  );
  const hold = active.current;
  return {
    ...base,
    pause,
    seek,
    seekResult,
    readResultTime,
    heldResultTime: readResultTime(),
    time: hold?.segment.sourceStart ?? base.time,
    onTime: (time: number) => active.current?.segment.sourceStart ?? base.onTime(time),
    setPlaying: (playing: boolean) => {
      if (!playing && active.current) return;
      base.setPlaying(playing);
    },
    onMediaError: () => {
      pause();
      active.current = null;
      base.onMediaError();
    },
    onEnded: () => {
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
        if (base.video.current && base.video.current.currentTime >= duration)
          played.current.clear();
        return base.play();
      }
      if (base.playing) pause();
      else {
        hold.started = null;
        base.setPlaying(true);
        refresh((value) => value + 1);
      }
    },
  };
}
