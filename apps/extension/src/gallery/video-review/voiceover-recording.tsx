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
  segments: readonly ReviewTimeSegment[];
  audio: ReturnType<typeof useReviewAudio>;
  session: ReturnType<typeof createVideoReviewSession>;
  guard(): boolean;
  flushAdvanced(): Promise<void>;
  onOpenChange?(open: boolean): void;
}) {
  const [recording, setRecording] = useState(false);
  const [takeStart, setTakeStart] = useState<number | null>(null);
  const takeSegments = useRef(args.segments);
  const takeIds = useRef(new WeakMap<Blob, string>());
  const preparedTakes = useRef(new WeakMap<Blob, PreparedReviewAudio>());
  const reviewId = useRef<string | null>(null);
  const playback = useVoiceoverPlayback(args.video, () => takeStart ?? args.time);
  return {
    video: args.video,
    recording,
    takeStart,
    open: () => {
      if (!args.guard()) return;
      playback.open();
      reviewId.current = args.session.getSnapshot().snapshot.workspace.aggregateId;
      args.onOpenChange?.(true);
      setTakeStart(args.time);
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
function useVoiceoverPlayback(video: RefObject<HTMLVideoElement | null>, startTime: () => number) {
  const generation = useRef(0);
  const openRef = useRef(false);
  const shouldPlay = useRef(false);
  const stop = () => {
    shouldPlay.current = false;
    video.current?.pause();
  };
  return {
    isOpen: () => openRef.current,
    open: () => {
      video.current?.pause();
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
}) {
  const guard = () => !args.busy && args.canStart();
  const onImportAudioFile = (
    file: File,
    lane: ReviewAudioLane = 'music',
    timelineTime?: number
  ) => {
    if (!guard()) return;
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
          const at =
            timelineTime ?? (lane === 'voiceover' ? args.time : args.toOutputTime(args.time));
          if (at === null) throw new Error(translate('gallery.videoReview.placementOnCut'));
          args.audio.addImported(
            lane === 'voiceover'
              ? anchorReviewVoiceoverAtSource(
                  importedAudioClip(assetId, duration, at, at + duration),
                  args.segments
                )
              : importedAudioClip(assetId, duration, at, args.resultDuration),
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
  const { onImportAudioFile, voiceover } = useReviewEditorAudio({
    busy: state.busy,
    canStart: state.canStart,
    time: state.time,
    resultDuration: state.timeline.resultDuration,
    segments: state.timeline.timeMap.getSegments(),
    toOutputTime: state.timeline.toOutputTime,
    onCutPlacement: () => state.setMessage(translate('gallery.videoReview.placementOnCut')),
    video: state.video,
    onOpenChange: state.setVoiceoverSilent,
    run: state.run,
    flushAdvanced: state.flushAdvanced,
    audio: state.audio,
    session: state.session,
  });
  return { onImportAudioFile, voiceover };
}
