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
import { saveReviewVoiceoverTake } from './voiceover-save';

/** Owns one recording lifecycle: open/close, playback sync, and the saved clip. */
export function useReviewVoiceoverRecording(args: {
  video: RefObject<HTMLVideoElement | null>;
  time: number;
  resultDuration: number;
  toOutputTime(source: number): number | null;
  audio: ReturnType<typeof useReviewAudio>;
  session: ReturnType<typeof createVideoReviewSession>;
  onCutPlacement?: () => void;
  guard(): boolean;
  flushAdvanced(): Promise<void>;
  onOpenChange?(open: boolean): void;
}) {
  const [recording, setRecording] = useState(false);
  const [takeStart, setTakeStart] = useState<number | null>(null);
  const [takeOutputStart, setTakeOutputStart] = useState<number | null>(null);
  const takeIds = useRef(new WeakMap<Blob, string>());
  const preparedTakes = useRef(new WeakMap<Blob, PreparedReviewAudio>());
  const reviewId = useRef<string | null>(null);
  const playback = useVoiceoverPlayback(args.video, () => takeStart ?? args.time);
  return {
    video: args.video,
    recording,
    takeStart,
    takeOutputStart,
    open: () => {
      if (!args.guard()) return;
      const outputStart = args.toOutputTime(args.time);
      if (outputStart === null || args.resultDuration - outputStart <= 0) {
        args.onCutPlacement?.();
        return;
      }
      playback.open();
      reviewId.current = args.session.getSnapshot().snapshot.workspace.aggregateId;
      args.onOpenChange?.(true);
      setTakeStart(args.time);
      setTakeOutputStart(outputStart);
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
    save: (file: File, trim: AudioTrimRange, signal: AbortSignal, take: Blob = file) =>
      saveReviewVoiceoverTake({
        file,
        trim,
        signal,
        take,
        outputStart: takeOutputStart ?? args.toOutputTime(takeStart ?? args.time),
        resultDuration: args.resultDuration,
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
      shouldPlay.current = playVideo;
      if (playVideo) {
        await node.play();
        if (currentGeneration !== generation.current && !shouldPlay.current) node.pause();
      }
    },
    syncStop: stop,
    syncResume: async (playVideo = true) => {
      if (!openRef.current || !playVideo) return;
      const currentGeneration = generation.current;
      shouldPlay.current = true;
      const node = video.current;
      await node?.play();
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
    if (timelineTime === undefined && args.toOutputTime(args.time) === null) {
      args.onCutPlacement();
      return;
    }
    void args.run(async () => {
      await importReviewAudio({
        file,
        signal: new AbortController().signal,
        assertCurrentTarget: () => {
          if (timelineTime === undefined && args.toOutputTime(args.time) === null)
            throw new Error(translate('gallery.videoReview.placementOnCut'));
        },
        attach: (assetId, duration) => {
          const at = timelineTime ?? args.toOutputTime(args.time);
          if (at === null) throw new Error(translate('gallery.videoReview.placementOnCut'));
          args.audio.addImported(
            importedAudioClip(assetId, duration, at, args.resultDuration),
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
    resultDuration: args.resultDuration,
    toOutputTime: args.toOutputTime,
    audio: args.audio,
    session: args.session,
    ...(args.onOpenChange ? { onOpenChange: args.onOpenChange } : {}),
    onCutPlacement: args.onCutPlacement,
    guard,
    flushAdvanced: args.flushAdvanced,
  });
  return { onImportAudioFile, voiceover };
}
