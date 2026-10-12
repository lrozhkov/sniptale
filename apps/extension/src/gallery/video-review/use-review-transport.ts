import type { ReviewEdit } from '../../features/video/review/types';
import { useMemo } from 'react';
import {
  buildReviewActionAudioPlan,
  type ReviewActionAudioUnavailable,
} from '../../features/video/review/action-audio';
import type { ReviewActionAudioSetting } from '../../features/video/review/advanced/action-audio';
import { projectReviewTelemetry } from '../../features/video/review/telemetry';
import type {
  QuickEditAudioClip,
  QuickEditOriginalAudio,
} from '../../features/video/review/advanced/types';
import { useReviewPlayback } from './use-playback';
import { useReviewTimeMap } from './use-review-time';
import { useReviewEditorAudioRuntime } from './use-review-audio-runtime';
import type { LoadedReview } from './use-session';

/** One transport owner: source-time playback, the review time map, and preview audio. */
export function useReviewTransport(args: {
  resource: LoadedReview;
  edits: readonly ReviewEdit[];
  originalAudio: QuickEditOriginalAudio;
  voiceover: readonly QuickEditAudioClip[];
  music: readonly QuickEditAudioClip[];
  actionAudio?: readonly ReviewActionAudioSetting[];
  actionsApplied?: boolean;
  onSeek(value: number): void;
  boundaries(): readonly number[] | undefined;
  onTransportFailure(reason?: ReviewActionAudioUnavailable['reason']): void;
  onTransportRecovered?(): void;
  onActionAudioRecovered?(): void;
  onInvalidRange?(): void;
  silent?: boolean;
}) {
  const { session, source } = args.resource;
  const {
    video,
    time,
    onTime,
    playing,
    setPlaying,
    seek,
    play,
    playbackRange,
    setPlaybackRange,
    onEnded,
    onMediaError,
    recovering,
    seekRevision,
  } = useReviewPlayback({
    duration: source.duration,
    edits: args.edits,
    original: args.originalAudio,
    silent: args.silent ?? false,
    retainCutTime: args.silent ?? false,
    boundaries: args.boundaries,
    onSeek: args.onSeek,
    onFailure: args.onTransportFailure,
    onRecovered: args.onTransportRecovered,
    onInvalidRange: args.onInvalidRange,
  });
  const timeline = useReviewTimeMap(source, args.edits, time);
  const actionPlan = useMemo(
    () =>
      buildReviewActionAudioPlan({
        markers: args.resource.telemetry
          ? projectReviewTelemetry(args.resource.telemetry, source.duration).markers
          : [],
        settings: args.actionAudio ?? [],
        segments: timeline.timeMap.getSegments(),
        applied: args.actionsApplied === true,
      }),
    [
      args.resource.telemetry,
      source.duration,
      args.actionAudio,
      args.actionsApplied,
      timeline.timeMap,
    ]
  );
  const actionSoundPreview = useReviewEditorAudioRuntime({
    video,
    playing: playing && !args.silent,
    silent: args.silent ?? false,
    outputTime: timeline.sceneOutputTime,
    seekRevision,
    originalAudio: args.originalAudio,
    voiceover: args.voiceover,
    music: args.music,
    actionPlan,
    sessionKey: session.getSnapshot().snapshot.workspace.aggregateId,
    onFailure: args.onTransportFailure,
    onActionAudioRecovered: args.onActionAudioRecovered,
  });
  return {
    actionSoundPreview,
    video,
    time,
    onTime,
    playing,
    setPlaying,
    seek,
    play,
    timeline,
    playbackRange,
    setPlaybackRange,
    onEnded,
    onMediaError,
    recovering,
    seekRevision,
  };
}
