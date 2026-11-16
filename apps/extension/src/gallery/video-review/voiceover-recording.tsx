import { reviewVoiceoverSampleDelta } from '../../features/video/review/voiceover-timing';
import { reviewInsertionTarget } from './range-placement';
import type { useReviewEditorState } from './use-editor-state';
import { useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { AudioTrimRange } from '../../composition/audio-recording/session-types';
import { translate } from '../../platform/i18n';
import type { useReviewAudio, ReviewAudioLane } from './use-review-audio';
import {
  importReviewAudio,
  importedAudioClip,
  type PreparedReviewAudio,
} from '../../workflows/video-review/audio-import';
import type { createVideoReviewSession } from '../../workflows/video-review/session';
import type { ReviewTimeSegment } from '../../features/video/review/timeline';
import { anchorReviewVoiceoverAtSource } from '../../features/video/review/voiceover-edits';
import { saveReviewVoiceoverTake } from './voiceover-save';

/** Owns one recording lifecycle: open/close, playback sync, and the saved clip. */
export function useReviewVoiceoverRecording(args: {
  video: RefObject<HTMLVideoElement | null>;
  time: number;
  end?: number | undefined;
  resultStart?: number | undefined;
  resultEnd?: number | undefined;
  segments: readonly ReviewTimeSegment[];
  audio: ReturnType<typeof useReviewAudio>;
  session: ReturnType<typeof createVideoReviewSession>;
  guard(): boolean;
  flushAdvanced(): Promise<void>;
  onOpenChange?(open: boolean): void;
  transport?: { seek(time: number): void; play(): void; pause(): void } | undefined;
}) {
  const [recording, setRecording] = useState(false);
  const requestClose = useRef<(() => void) | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const [takeStart, setTakeStart] = useState<number | null>(null);
  const [takeEnd, setTakeEnd] = useState<number | undefined>(undefined);
  const takeResult = useRef<{ start: number; end: number } | null>(null);
  const takeSegments = useRef(args.segments);
  const takeIds = useRef(new WeakMap<Blob, string>());
  const preparedTakes = useRef(new WeakMap<Blob, PreparedReviewAudio>());
  const reviewId = useRef<string | null>(null);
  const playback = useVoiceoverPlayback(
    args.video,
    () => takeResult.current?.start ?? takeStart ?? args.time,
    args.transport
  );
  return {
    video: args.video,
    opener,
    recording,
    requestClose,
    takeStart,
    takeEnd,
    takeDuration: takeResult.current
      ? takeResult.current.end - takeResult.current.start
      : takeStart === null || takeEnd === undefined
        ? undefined
        : reviewVoiceoverSampleDelta(takeStart, takeEnd, 1, takeSegments.current),
    open: () => {
      if (
        !args.guard() ||
        (args.resultStart !== undefined
          ? args.resultStart >= (args.resultEnd ?? Infinity)
          : args.end !== undefined && args.time >= args.end)
      )
        return;
      opener.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      playback.open();
      reviewId.current = args.session.getSnapshot().snapshot.workspace.aggregateId;
      args.onOpenChange?.(true);
      takeResult.current =
        args.resultStart === undefined
          ? null
          : {
              start: args.resultStart,
              end: args.resultEnd ?? args.segments.at(-1)?.resultEnd ?? args.resultStart,
            };
      setTakeStart(args.time);
      setTakeEnd(args.end);
      takeSegments.current = args.segments;
      setRecording(true);
    },
    close: () => {
      playback.close();
      reviewId.current = null;
      args.onOpenChange?.(false);
      setRecording(false);
    },
    syncStart: playback.syncStart,
    syncStop: playback.syncStop,
    syncPause: playback.syncStop,
    syncResume: playback.syncResume,
    /** The shared recorder already trims the file, so placement is take start + trim offset. */
    save: (
      file: File,
      trim: AudioTrimRange,
      signal: AbortSignal,
      take: Blob = file,
      onRetained?: () => void
    ) =>
      saveReviewVoiceoverTake({
        file,
        trim,
        signal,
        take,
        ...(onRetained ? { onRetained } : {}),
        sourceStart: takeStart ?? args.time,
        ...(takeEnd === undefined ? {} : { sourceEnd: takeEnd }),
        ...(takeResult.current
          ? { resultStart: takeResult.current.start, resultEnd: takeResult.current.end }
          : {}),
        segments: takeSegments.current,
        audio: args.audio,
        session: args.session,
        takeIds: takeIds.current,
        preparedTakes: preparedTakes.current,
        isCurrent: () =>
          playback.isOpen() &&
          args.session.getSnapshot().snapshot.workspace.aggregateId === reviewId.current,
        flushAdvanced: args.flushAdvanced,
      }),
  };
}

/** Owns delayed playback completion and cancellation across recording generations. */
export function useVoiceoverPlayback(
  video: RefObject<HTMLVideoElement | null>,
  startTime: () => number,
  transport?: { seek(time: number): void; play(): void; pause(): void }
) {
  const generation = useRef(0);
  const openRef = useRef(false);
  const shouldPlay = useRef(false);
  const stop = () => {
    shouldPlay.current = false;
    video.current?.pause();
    transport?.pause();
  };
  return {
    isOpen: () => openRef.current,
    open: () => {
      video.current?.pause();
      transport?.pause();
      generation.current += 1;
      openRef.current = true;
      shouldPlay.current = false;
    },
    close: () => {
      generation.current += 1;
      openRef.current = false;
      stop();
    },
    syncStart: async (playVideo = true) => {
      const node = video.current;
      if (!node || !openRef.current) return;
      const currentGeneration = generation.current;
      if (transport) {
        transport.seek(startTime());
        shouldPlay.current = playVideo;
        if (playVideo) transport.play();
        return;
      }
      node.currentTime = startTime();
      const canPlay = playVideo && !node.ended && !(node.currentTime >= node.duration);
      shouldPlay.current = canPlay;
      if (canPlay) {
        await node.play();
        if (currentGeneration !== generation.current && !shouldPlay.current) node.pause();
      }
    },
    syncStop: stop,
    syncResume: async (playVideo = true) => {
      if (!openRef.current || !playVideo) return;
      const currentGeneration = generation.current;
      if (transport) {
        shouldPlay.current = true;
        transport.play();
        return;
      }
      const node = video.current;
      if (!node || node.ended || node.currentTime >= node.duration) return;
      shouldPlay.current = true;
      await node.play();
      if (currentGeneration !== generation.current && !shouldPlay.current) node?.pause();
    },
  };
}

/** Wires music import and voiceover recording to the review audio model. */
export function useReviewEditorAudio(args: {
  busy: boolean;
  canStart: () => boolean;
  time: number;
  end?: number | undefined;
  resultStart?: number | undefined;
  resultEnd?: number | undefined;
  resultDuration: number;
  segments: readonly ReviewTimeSegment[];
  toOutputTime(source: number): number | null;
  onCutPlacement(): void;
  video: RefObject<HTMLVideoElement | null>;
  run(action: () => Promise<unknown>): Promise<unknown>;
  flushAdvanced(): Promise<void>;
  audio: ReturnType<typeof useReviewAudio>;
  session: ReturnType<typeof createVideoReviewSession>;
  onOpenChange?(open: boolean): void;
  transport?: { seek(time: number): void; play(): void; pause(): void } | undefined;
}) {
  const guard = () => !args.busy && args.canStart();
  const onImportAudioFile = (
    file: File,
    lane: ReviewAudioLane = 'music',
    timelineTime?: number
  ) => {
    if (!guard()) return;
    const sourceEnd = args.segments.at(-1)?.sourceEnd ?? args.time;
    const end = timelineTime === undefined ? (args.end ?? sourceEnd) : sourceEnd;
    const at = timelineTime ?? (lane === 'voiceover' ? args.time : args.toOutputTime(args.time));
    const outputEnd =
      timelineTime === undefined
        ? Math.min(args.resultDuration, args.toOutputTime(end) ?? args.resultDuration)
        : args.resultDuration;
    if (at === null || at >= (lane === 'voiceover' ? end : outputEnd)) {
      args.onCutPlacement();
      return;
    }
    if (
      lane !== 'voiceover' &&
      timelineTime === undefined &&
      args.toOutputTime(args.time) === null
    ) {
      args.onCutPlacement();
      return;
    }
    void args.run(async () => {
      await importReviewAudio({
        file,
        signal: new AbortController().signal,
        assertCurrentTarget: () => {
          if (
            lane !== 'voiceover' &&
            timelineTime === undefined &&
            args.toOutputTime(args.time) === null
          )
            throw new Error(translate('gallery.videoReview.placementOnCut'));
        },
        attach: (assetId, duration) => {
          args.audio.addImported(
            lane === 'voiceover'
              ? anchorReviewVoiceoverAtSource(
                  importedAudioClip(
                    assetId,
                    duration,
                    at,
                    at + Math.min(duration, reviewVoiceoverSampleDelta(at, end, 1, args.segments))
                  ),
                  args.segments
                )
              : importedAudioClip(assetId, duration, at, outputEnd),
            lane,
            duration,
            file.name
          );
          return args.flushAdvanced();
        },
      });
    });
  };
  const voiceover = useReviewVoiceoverRecording({
    video: args.video,
    time: args.time,
    end: args.end,
    resultStart: args.resultStart,
    resultEnd: args.resultEnd,
    transport: args.transport,
    segments: args.segments,
    audio: args.audio,
    session: args.session,
    ...(args.onOpenChange ? { onOpenChange: args.onOpenChange } : {}),
    guard,
    flushAdvanced: args.flushAdvanced,
  });
  return { onImportAudioFile, voiceover };
}

export function useReviewAudioWiring(state: ReturnType<typeof useReviewEditorState>) {
  const selected =
    state.playbackRange ??
    (state.activeSelection.kind === 'none' && state.selection.kind === 'range'
      ? state.selection
      : null);
  const target = reviewInsertionTarget(state.time, selected);
  const selectedResult =
    selected &&
    ('result' in selected && selected.result
      ? selected.result
      : {
          start: state.timeline.toOutputTime(selected.start) ?? 0,
          end: state.timeline.toOutputTime(selected.end) ?? state.timeline.resultDuration,
        });
  const result = reviewInsertionTarget(state.timeline.outputTime ?? 0, selectedResult);
  const { onImportAudioFile, voiceover } = useReviewEditorAudio({
    busy: state.busy,
    canStart: state.canStart,
    time: target?.start ?? state.time,
    end: target?.end ?? state.source.duration,
    resultStart: result?.start ?? state.timeline.outputTime ?? 0,
    resultEnd: result?.end ?? state.timeline.resultDuration,
    resultDuration: state.timeline.resultDuration,
    segments: state.timeline.timeMap.getSegments(),
    toOutputTime: state.timeline.toOutputTime,
    onCutPlacement: () => state.setMessage(translate('gallery.videoReview.placementOnCut')),
    video: state.video,
    onOpenChange: state.setVoiceoverSilent,
    transport: { seek: state.seekResult, play: state.play, pause: state.pause },
    run: state.run,
    flushAdvanced: state.flushAdvanced,
    audio: state.audio,
    session: state.session,
  });
  return { onImportAudioFile, voiceover };
}
