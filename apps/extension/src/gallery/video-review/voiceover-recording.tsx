import { useState } from 'react';
import type { RefObject } from 'react';
import { MaterialAudioRecordingModal } from '../../composition/audio-recording/dialog';
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
  guard(): boolean;
  flushAdvanced(): Promise<void>;
}) {
  const [recording, setRecording] = useState(false);
  const [takeStart, setTakeStart] = useState<number | null>(null);
  return {
    recording,
    takeStart,
    open: () => {
      if (!args.guard()) return;
      args.video.current?.pause();
      setTakeStart(args.time);
      setRecording(true);
    },
    close: () => setRecording(false),
    syncStart: async () => {
      const node = args.video.current;
      if (!node) return;
      node.currentTime = args.time;
      await node.play();
    },
    syncStop: () => args.video.current?.pause(),
    /** The shared recorder already trims the file, so placement is take start + trim offset. */
    save: async (file: File, trim: AudioTrimRange, signal: AbortSignal) => {
      if (signal.aborted) return;
      const sourceAt = (takeStart ?? args.time) + trim.trimStart;
      await importReviewAudio({
        file,
        signal,
        assertCurrentTarget: () => {
          if (args.toOutputTime(sourceAt) === null)
            throw new Error(translate('gallery.videoReview.placementOnCut'));
        },
        attach: (assetId, duration) => {
          const at = args.toOutputTime(sourceAt);
          if (at === null) throw new Error(translate('gallery.videoReview.placementOnCut'));
          args.audio.addImported(
            importedAudioClip(assetId, duration, at, args.resultDuration),
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

/**
 * One voiceover take through the shared material recorder; the caller owns clip
 * placement and playback sync. The capture limit is the remaining timeline.
 */
export function ReviewVoiceoverRecording(props: {
  isOpen: boolean;
  playhead: number;
  timelineDuration: number;
  onClose(): void;
  onSyncStart(): Promise<void>;
  onSyncStop(): void;
  onSave(file: File, trim: AudioTrimRange, signal: AbortSignal): Promise<void>;
}) {
  const remaining = Math.max(0, props.timelineDuration - props.playhead);
  return (
    <MaterialAudioRecordingModal
      isOpen={props.isOpen}
      title={translate('gallery.videoReview.recordVoiceover')}
      captureLimitSeconds={remaining}
      timeline={{
        startTime: props.playhead,
        duration: remaining,
        beforeStart: props.onSyncStart,
        onStop: props.onSyncStop,
      }}
      onClose={props.onClose}
      onSave={props.onSave}
    />
  );
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
    guard,
    flushAdvanced: args.flushAdvanced,
  });
  return { onImportAudioFile, voiceover };
}
