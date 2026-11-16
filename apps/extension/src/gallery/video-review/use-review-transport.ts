import type { ReviewEdit } from '../../features/video/review/types';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createReviewRecordingActionAudioSource,
  type RecordingProjectActionAudioSource,
} from '../../workflows/video-review/recording-action-audio';
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
  interactionTimeline?:
    | import('../../features/video/review/interaction-types').ReviewInteractionTimeline
    | undefined;
  interactionEnabled?: { keyboard?: boolean; mouse?: boolean };
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
  const playbackAudio = useRef<ReturnType<typeof useReviewEditorAudioRuntime> | null>(null);
  const playIntent = useRef(0);
  const starting = useRef(false);
  const [preparingPlayback, setPreparingPlayback] = useState(false);
  function failTransport(reason?: ReviewActionAudioUnavailable['reason']) {
    pause();
    args.onTransportFailure(reason);
  }
  const {
    video,
    pause: pausePlayback,
    seekResult: seekResultPlayback,
    readResultTime,
    heldResultTime,
    time,
    onTime,
    playing,
    setPlaying,
    playheadClock,
    setPresentationActive,
    onPresentedTime,
    seek: seekPlayback,
    play,
    playbackRange,
    setPlaybackRange,
    onEnded,
    onMediaError,
    recovering,
    seekRevision,
    navigationRevision,
  } = useReviewPlayback({
    duration: source.duration,
    edits: args.edits,
    original: args.originalAudio,
    silent: args.silent ?? false,
    retainCutTime: args.silent ?? false,
    boundaries: args.boundaries,
    onSeek: args.onSeek,
    onFailure: failTransport,
    prepareAfterSeek: () => playbackAudio.current?.preparePlayback() ?? Promise.resolve(true),
    onPreparedPlay: () => playbackAudio.current?.startPlayback(),
    onRecovered: args.onTransportRecovered,
    onInvalidRange: args.onInvalidRange,
  });
  const pause = useCallback(() => {
    ++playIntent.current;
    starting.current = false;
    setPreparingPlayback(false);
    playbackAudio.current?.stopPlayback();
    pausePlayback();
  }, [pausePlayback]);
  const seek = useCallback(
    (time: number, snap?: boolean) => {
      pause();
      seekPlayback(time, snap);
    },
    [pause, seekPlayback]
  );
  const seekResult = useCallback(
    (time: number) => {
      pause();
      seekResultPlayback(time);
    },
    [pause, seekResultPlayback]
  );
  const timeline = useReviewTimeMap(source, args.edits, time, heldResultTime, readResultTime);
  const actionPlan = useMemo(
    () =>
      buildReviewActionAudioPlan({
        markers: projectReviewTelemetry(
          args.resource.telemetry ?? { actionEvents: [], signals: [], cursorTrack: null },
          source.duration,
          false,
          args.interactionTimeline,
          args.interactionEnabled
        ).markers,
        settings: args.actionAudio ?? [],
        segments: timeline.timeMap.getSegments(),
        applied: args.actionsApplied === true,
      }),
    [
      args.resource.telemetry,
      source.duration,
      args.interactionTimeline,
      args.interactionEnabled,
      args.actionAudio,
      args.actionsApplied,
      timeline.timeMap,
    ]
  );
  const recordingAudioRequest = useMemo(
    () =>
      args.resource.historyProject
        ? {
            project: args.resource.historyProject,
            source,
            edits: args.edits,
            settings: args.actionAudio ?? [],
            applied: args.actionsApplied === true,
            interactionTimeline: args.interactionTimeline,
            interactionEnabled: args.interactionEnabled,
          }
        : null,
    [
      args.resource.historyProject,
      source,
      args.edits,
      args.actionAudio,
      args.actionsApplied,
      args.interactionTimeline,
      args.interactionEnabled,
    ]
  );
  const [recordingAudio, setRecordingAudio] = useState<{
    request: typeof recordingAudioRequest;
    source: RecordingProjectActionAudioSource | null;
  } | null>(null);
  const onFailure = useRef(failTransport);
  onFailure.current = failTransport;
  useEffect(() => {
    if (!recordingAudioRequest) {
      setRecordingAudio(null);
      return;
    }
    let source: RecordingProjectActionAudioSource | null = null;
    try {
      source = createReviewRecordingActionAudioSource(recordingAudioRequest);
    } catch {
      onFailure.current();
    }
    setRecordingAudio({ request: recordingAudioRequest, source });
    return () => source?.dispose();
  }, [recordingAudioRequest]);
  const recordingActionSource =
    recordingAudio?.request === recordingAudioRequest ? recordingAudio?.source : null;
  const actionSoundPreview = useReviewEditorAudioRuntime({
    video,
    playing: playing && !args.silent,
    silent: args.silent ?? false,
    outputTime: timeline.sceneOutputTime,
    sourceToResult: timeline.readOutputTime,
    seekRevision,
    originalAudio: args.originalAudio,
    originalSource: {
      file: args.resource.file,
      segments: timeline.timeMap.getSegments(),
      edits: args.edits,
    },
    voiceover: args.voiceover,
    music: args.music,
    actionPlan,
    ...(recordingActionSource ? { recordingActionSource } : {}),
    sessionKey: session.getSnapshot().snapshot.workspace.aggregateId,
    onFailure: failTransport,
    onActionAudioRecovered: args.onActionAudioRecovered,
  });
  playbackAudio.current = actionSoundPreview;
  return {
    actionSoundPreview,
    pause,
    seekResult,
    video,
    time,
    onTime,
    playing,
    setPlaying,
    playheadClock,
    setPresentationActive,
    onPresentedTime,
    seek,
    play: async () => {
      const active = playing || video.current?.paused === false || starting.current;
      if (active) {
        pause();
        return;
      }
      const intent = ++playIntent.current;
      starting.current = true;
      try {
        if (!args.silent) {
          setPreparingPlayback(true);
          if (!(await actionSoundPreview.preparePlayback())) return;
        }
        if (intent !== playIntent.current) return;
        play();
      } finally {
        if (intent === playIntent.current) {
          starting.current = false;
          setPreparingPlayback(false);
        }
      }
    },
    timeline,
    playbackRange,
    setPlaybackRange,
    onEnded,
    onMediaError,
    recovering,
    preparingPlayback,
    seekRevision,
    navigationRevision,
  };
}
