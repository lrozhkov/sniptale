import { useState } from 'react';
import type { RefObject } from 'react';
import type { AudioTrimRange } from '../../composition/audio-recording/session-types';
import { translate } from '../../platform/i18n';
import type { useReviewAudio, ReviewAudioLane } from './use-review-audio';
import { importReviewAudio, importedAudioClip } from '../../workflows/video-review/audio-import';

/** Owns one recording lifecycle: open/close, playback sync, and the saved clip. */
export function useReviewVoiceoverRecording(args: {
  video: RefObject<HTMLVideoElement | null>;
  time: number;
  resultDuration: number;
  toOutputTime(source: number): number | null;
  audio: ReturnType<typeof useReviewAudio>;
  onCutPlacement?: () => void;
  guard(): boolean;
  flushAdvanced(): Promise<void>;
}) {
  const [recording, setRecording] = useState(false);
  const [takeStart, setTakeStart] = useState<number | null>(null);
  const [takeOutputStart, setTakeOutputStart] = useState<number | null>(null);
  return {
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
      args.video.current?.pause();
      setTakeStart(args.time);
      setTakeOutputStart(outputStart);
      setRecording(true);
    },
    close: () => setRecording(false),
    syncStart: async () => {
      const node = args.video.current;
      if (!node) return;
      node.currentTime = takeStart ?? args.time;
      await node.play();
    },
    syncStop: () => args.video.current?.pause(),
    syncPause: () => args.video.current?.pause(),
    syncResume: async () => {
      await args.video.current?.play();
    },
    /** The shared recorder already trims the file, so placement is take start + trim offset. */
    save: async (file: File, trim: AudioTrimRange, signal: AbortSignal) => {
      if (signal.aborted) return;
      const outputAt = takeOutputStart ?? args.toOutputTime(takeStart ?? args.time);
      if (outputAt === null) throw new Error(translate('gallery.videoReview.placementOnCut'));
      const placement = outputAt + trim.trimStart;
      await importReviewAudio({
        file,
        signal,
        assertCurrentTarget: () => {
          if (placement >= args.resultDuration)
            throw new Error(translate('gallery.videoReview.placementOnCut'));
        },
        attach: (assetId, duration) => {
          args.audio.addImported(
            importedAudioClip(assetId, duration, placement, args.resultDuration),
            'voiceover',
            duration,
            file.name
          );
          return args.flushAdvanced();
        },
      });
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
    onCutPlacement: args.onCutPlacement,
    guard,
    flushAdvanced: args.flushAdvanced,
  });
  return { onImportAudioFile, voiceover };
}
