import type { ReviewTransportFailure } from './transport';
import type { ReviewEdit } from '../../features/video/review/types';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
  onTransportFailure(failure: ReviewTransportFailure): void;
  onTransportRecovered?(): void;
  onActionAudioRecovered?(): void;
  onInvalidRange?(): void;
  silent?: boolean;
  mappedOriginal?: boolean;
}) {
  const { session, source } = args.resource;
  const playbackAudio = useRef<ReturnType<typeof useReviewEditorAudioRuntime> | null>(null);
  const readEdits = useCallback(() => session.getSnapshot().document.edits, [session]);
  const acceptedEdits = readEdits();
  const playback = useReviewPlayback({
    sourceId: args.resource.url,
    duration: source.duration,
    edits: args.edits,
    readEdits,
    original: args.originalAudio,
    silent: args.silent ?? false,
    retainCutTime: args.silent ?? false,
    boundaries: args.boundaries,
    onSeek: args.onSeek,
    onFailure: args.onTransportFailure,
    prepareAfterSeek: (signal, request) =>
      playbackAudio.current?.preparePlayback(request, signal) ?? Promise.resolve(true),
    onPreparedPlay: (request) => playbackAudio.current?.startPlayback(request),
    onStopPlayback: () => playbackAudio.current?.stopPlayback(),
    readAudioClock: () => playbackAudio.current?.readAudioClock() ?? null,
    onRecovered: args.onTransportRecovered,
    onInvalidRange: args.onInvalidRange,
  });
  const {
    video,
    time,
    playing,
    playheadClock,
    readPosition,
    seekRevision,
    syncConfiguration,
    pause,
  } = playback;
  useLayoutEffect(() => {
    let current = acceptedEdits;
    const synchronize = () => {
      const next = readEdits();
      if (next === current) return;
      current = next;
      syncConfiguration();
    };
    const unsubscribe = session.subscribe(synchronize);
    synchronize();
    return unsubscribe;
  }, [session, syncConfiguration, readEdits, acceptedEdits]);
  function failTransport(reason?: ReviewActionAudioUnavailable['reason']) {
    playback.transport.fail({ kind: 'audio', ...(reason ? { reason } : {}) });
  }
  const readHeldTime = useCallback(() => {
    const position = readPosition();
    return position.source?.kind === 'freeze' ? position.resultTime : null;
  }, [readPosition]);
  const discrete = playback.transport.getStatusSnapshot().position;
  const heldTime = discrete.source?.kind === 'freeze' ? discrete.resultTime : null;
  const timeline = useReviewTimeMap(source, acceptedEdits, time, heldTime, readHeldTime);
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
            edits: acceptedEdits,
            settings: args.actionAudio ?? [],
            applied: args.actionsApplied === true,
            interactionTimeline: args.interactionTimeline,
            interactionEnabled: args.interactionEnabled,
          }
        : null,
    [
      args.resource.historyProject,
      source,
      acceptedEdits,
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
    mappedOriginal: args.mappedOriginal === true,
    transportControl: {
      readPosition,
      readSchedulingPosition: playback.transport.readSchedulingPosition,
      readTimeMap: playback.transport.getTimeMapSnapshot,
      alignNativeOriginal: playback.transport.alignNativeOriginal,
    },
    video,
    playbackClock: playheadClock,
    playing: playing && !args.silent,
    silent: args.silent ?? false,
    outputTime: timeline.sceneOutputTime,
    sourceToResult: timeline.readOutputTime,
    seekRevision,
    originalAudio: args.originalAudio,
    originalSource: {
      file: args.resource.file,
      segments: timeline.timeMap.getSegments(),
      edits: acceptedEdits,
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
  const auditionAction = actionSoundPreview.audition;
  const audition = useCallback(
    (...parameters: Parameters<typeof auditionAction>) => {
      pause();
      auditionAction(...parameters);
    },
    [pause, auditionAction]
  );
  return { ...playback, actionSoundPreview: { ...actionSoundPreview, audition }, timeline };
}
