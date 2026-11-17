import { reviewPlaybackFailureMessage } from './feedback';
import type { ReviewTransportFailure } from './transport';
import { reviewInsertionTarget, reviewResultInsertionContext } from './range-placement';
import {
  createReviewCommandPort,
  reviewCommandSourceTime,
  reviewCommandCanPublishSelection,
  type ReviewCommandContext,
  type ReviewCommandPort,
} from './command-context';
import { createTrackProjection } from './track-projection';
import { projectReviewCursorMotions } from '../../features/video/review/timeline-placement';
import { evaluateCursorFocusSegment } from '../../features/video/project/cursor-focus-path/evaluator';
import { resolveReviewCursorFocusPath } from '../../features/video/review/advanced/cursor-focus-path';
import { createReviewInteractionEditor } from './interaction-editor';
import { useReviewCursorMotions } from './cursor-motion-editor';
import { useReviewRecordingHistory } from './use-recording-history';
import {
  addReviewCursorFocusKey,
  moveCursorFocusTimelineKey,
} from '../../features/video/project/cursor-focus-path/authoring';
import { useReviewAnnotationEffects } from './annotation-effects-editor';
import { useReviewPresentation } from './use-review-presentation';
import { useReviewWatermark } from './use-review-watermark';
import { createReviewSpeechEditGuard } from './speech-edit-guard';
import { scheduleReviewKeys } from '../../features/video/review/key-animation';
import { scheduleReviewClicks } from '../../features/video/review/click-animation';
import { useReviewNoteTransitions } from './note-transitions';
import { useCallback, useMemo, useRef, useState, type SetStateAction } from 'react';
import {
  attachReviewRecordingWindow,
  projectReviewTelemetry,
  reviewRecordingWindow,
} from '../../features/video/review/telemetry';
import { translate } from '../../platform/i18n';
import type {
  ReviewAnchor,
  ReviewAnnotation,
  ReviewSelection,
} from '../../features/video/review/types';
import type { ReviewTelemetryMarker } from '../../features/video/review/telemetry';
import { useReviewBackgroundImport } from './use-review-background';
import { useReviewComposer, useReviewSnapshot, type LoadedReview } from './use-session';
import { useReviewExport } from './use-export';
import { useReviewAdvanced } from './use-advanced';
import { resolveQuickEditEffectiveState } from '../../features/video/review/advanced/effective';
import { useReviewTransport } from './use-review-transport';
import {
  reviewSelectionSeekTarget,
  reviewSelectionSourceTime,
  useReviewSelection,
} from './use-review-selection';
import { useReviewEditorWiring } from './use-review-wiring';
import { useReviewEditingTools } from './use-review-editing';
import { useReviewWebcamEditor } from './webcam-editor';
import { computeQuickEditSceneSize } from '../../features/video/review/advanced/scene';
import { buildReviewTimeMap } from '../../features/video/review/timeline';

export function useReviewEditorState(resource: LoadedReview) {
  const core = useReviewEditorCore(resource);
  const {
    session,
    source,
    snapshot,
    composer,
    exporter,
    advancedState,
    advanced,
    selection,
    setSelection,
    setSelected,
    setActiveSelection,
    activeSelection,
    busy,
    run,
    canStart,
    video,
    pause,
    time,
    seek,
    play,
    timeline,
    zoom,
    cuts,
  } = core;
  const wiring = useReviewEditorWiring({
    commands: core.commands,
    session,
    document: snapshot.document,
    advanced,
    advancedState,
    exporter,
    zoom,
    annotationEffects: core.annotationEffects,
    activeSelection,
    setActiveSelection,
    clearAnnotation: setSelected,
    time,
    resultTime: timeline.sceneOutputTime,
    timelineDuration: timeline.resultDuration,
    busy,
    canStart,
    run,
    composer,
    beforeAction: core.beforeAction,
    playbackRange: core.playbackRange,
    video,
    pause,
    seek,
    setTimelineSelection: setSelection,
    setCutting: cuts.setCutting,
    telemetry: core.historyTelemetry,
    historyPending: core.history.pending,
    sourceDuration: source.duration,
    sourceGeometry: source,
    actionsVisible: advanced.ui.tracks.actions,
    play,
    timelineSelection: selection,
    cuts,
  });
  core.selectionNavigation.current = (selection, context) => {
    const currentDocument = core.session.getSnapshot().document;
    const currentAdvanced = core.advancedState.readCurrent();
    const target = reviewSelectionSeekTarget(selection, {
      document: currentDocument,
      advanced: currentAdvanced,
      duration: context.scope.sourceDuration,
      markers: wiring.projected.markers,
      sourceTime: reviewCommandSourceTime(context) ?? NaN,
      resultTime: context.position.resultTime ?? NaN,
      segments: buildReviewTimeMap(context.scope.sourceDuration, currentDocument.edits),
    });
    if (target?.domain === 'result') core.seekResult(target.time);
    else if (target) core.seek(target.time, false);
  };
  const actionsApplied = resolveQuickEditEffectiveState(advanced).actionsApplied;
  const clickCues = useMemo(
    () =>
      scheduleReviewClicks(
        wiring.projected.markers,
        actionsApplied && (advanced.ui.tracks.mouse ?? advanced.ui.tracks.actions) !== false
          ? (advanced.clickAnimations ?? [])
          : [],
        core.timeline.timeMap.getSegments()
      ),
    [
      wiring.projected.markers,
      actionsApplied,
      advanced.clickAnimations,
      advanced.ui.tracks.mouse,
      advanced.ui.tracks.actions,
      core.timeline.timeMap,
    ]
  );
  const keyCues = useMemo(
    () =>
      scheduleReviewKeys(
        wiring.projected.markers,
        actionsApplied && (advanced.ui.tracks.keyboard ?? advanced.ui.tracks.actions) !== false
          ? (advanced.keyAnimations ?? [])
          : [],
        core.timeline.timeMap.getSegments()
      ),
    [
      wiring.projected.markers,
      actionsApplied,
      advanced.keyAnimations,
      advanced.ui.tracks.keyboard,
      advanced.ui.tracks.actions,
      core.timeline.timeMap,
    ]
  );
  const state = assembleReviewEditorState(core, wiring);
  const cursorProjection = useMemo(
    () => createTrackProjection(source.duration, state.snapshot.document.edits),
    [source.duration, state.snapshot.document.edits]
  );
  const cursorMotions = useMemo(
    () =>
      projectReviewCursorMotions(
        state.advanced.cursorMotions,
        state.timeline.timeMap.getSegments()
      ),
    [state.advanced.cursorMotions, state.timeline.timeMap]
  );
  const cursorInsertion = reviewResultInsertionContext({
    time: state.time,
    resultTime: state.timeline.sceneOutputTime,
    range:
      state.playbackRange ??
      (state.activeSelection.kind === 'none' && state.selection.kind === 'range'
        ? state.selection
        : null),
    projection: cursorProjection,
  });
  const cursorMotion = useReviewCursorMotions({
    commands: core.commands,
    advanced: { ...state.advanced, ...(cursorMotions ? { cursorMotions } : {}) },
    time: cursorInsertion.time,
    insertionRange: cursorInsertion.range,
    insertionPoint: (sourceTime) => state.insertionPoint(sourceTime),
    pause: state.pause,
    duration: cursorProjection.resultDuration,
    selection: state.activeSelection,
    onChange: state.setCursorMotions,
    onEnabledChange: state.setCursorMotionEnabled,
    select: state.setActiveSelection,
    seek: state.seekResult,
    canStart: state.canStart,
    setMessage: state.setMessage,
  });
  const interactionEditor = createReviewInteractionEditor({
    ...state,
    commands: core.commands,
    time: cursorInsertion.time,
    insertionRange: cursorInsertion.range,
    duration: cursorProjection.resultDuration,
    sourceDuration: source.duration,
    toResult: (time) =>
      state.timeline.timeMap.sourceToTimeline(time) ?? state.timeline.sceneOutputTime,
    insertionPoint: (time) =>
      state.insertionPoint(state.timeline.timeMap.timelineToSource(time) ?? state.time),
  });
  return {
    ...state,
    interactionEditor,
    cursorMotion,
    clickCues,
    keyCues,
  };
}

/** Combines session state with the timeline transport and editing controls. */
function useReviewEditorCore(resource: LoadedReview) {
  const base = useReviewEditorBase(resource);
  const timeline = useReviewEditorTimeline(resource, base);
  const commands = base.commands;
  const insertionProjection = useMemo(
    () => createTrackProjection(resource.source.duration, base.snapshot.document.edits),
    [resource.source.duration, base.snapshot.document.edits]
  );
  base.stopForEdit.current = () => {
    const status = timeline.transport.getStatusSnapshot();
    if (status.mode !== 'paused' && status.mode !== 'ended' && status.mode !== 'failed')
      timeline.pause();
  };
  const styles = [...(base.advanced.keyAnimations ?? []), ...(base.advanced.clickAnimations ?? [])];
  const reach =
    Math.max(
      1,
      ...styles.map((style) => Math.max(style.before, style.after) + Math.abs(style.offset))
    ) * Math.max(1, ...timeline.timeline.timeMap.getSegments().map((segment) => segment.rate));
  const previewHistory = useReviewRecordingHistory(resource, timeline.time, base.activeSelection, {
    reach,
    clock: timeline.playheadClock,
    interactionTimeline: base.advanced.interactionTimeline,
  });
  const [visibleHistory, setVisibleHistory] = useState<{
    project: LoadedReview['historyProject'];
    start: number;
    end: number;
  } | null>(null);
  const historyRange =
    visibleHistory && visibleHistory.project === resource.historyProject
      ? visibleHistory
      : { start: 0, end: resource.source.duration };
  const setHistoryRange = useCallback(
    (range: { start: number; end: number }) =>
      setVisibleHistory((current) =>
        current &&
        current.project === resource.historyProject &&
        current.start === range.start &&
        current.end === range.end
          ? current
          : { project: resource.historyProject, ...range }
      ),
    [resource.historyProject]
  );
  const timelineHistory = useReviewRecordingHistory(
    resource,
    (historyRange.start + historyRange.end) / 2,
    base.activeSelection,
    {
      range: historyRange,
      includeCursor: false,
      interactionTimeline: base.advanced.interactionTimeline,
    }
  );
  const history = {
    ...previewHistory,
    failed: previewHistory.failed || timelineHistory.failed,
    pending: previewHistory.pending || timelineHistory.pending,
    initialLoading: previewHistory.initialLoading || timelineHistory.initialLoading,
    retry() {
      previewHistory.retry();
      timelineHistory.retry();
    },
  };
  const historyTelemetry = useMemo(() => {
    if (!resource.historyProject || !previewHistory.telemetry) return resource.telemetry;
    const markers = new Map(
      [
        ...projectReviewTelemetry(timelineHistory.telemetry!, resource.source.duration).markers,
        ...projectReviewTelemetry(previewHistory.telemetry, resource.source.duration).markers,
      ].map((marker) => [JSON.stringify(marker.ref), marker])
    );
    return attachReviewRecordingWindow(previewHistory.telemetry, {
      ...reviewRecordingWindow(previewHistory.telemetry),
      markers: [...markers.values()].sort((left, right) => left.start - right.start),
    });
  }, [
    resource.historyProject,
    resource.telemetry,
    resource.source.duration,
    previewHistory.telemetry,
    timelineHistory.telemetry,
  ]);
  const presentationPending = useRef(false);
  const webcamResultClock =
    base.advanced.webcam?.timeDomain === 'result' ||
    timeline.timeline.timeMap.getSegments().some((segment) => segment.kind === 'freeze');
  const webcam = useReviewWebcamEditor({
    commands,
    session: base.session,
    advanced: base.advancedState,
    scene: computeQuickEditSceneSize({
      source: resource.source,
      background: base.features.background,
      canvas: base.features.canvas,
      windowHeader: base.features.windowHeader,
    }),
    sourceDuration: webcamResultClock ? timeline.timeline.resultDuration : resource.source.duration,
    time: webcamResultClock ? timeline.timeline.sceneOutputTime : timeline.time,
    sourceTime: timeline.time,
    segments: timeline.timeline.timeMap.getSegments(),
    insertionRange: webcamResultClock
      ? reviewResultInsertionContext({
          time: timeline.time,
          resultTime: timeline.timeline.sceneOutputTime,
          range:
            timeline.playbackRange ??
            (base.activeSelection.kind === 'none' && base.selection.kind === 'range'
              ? base.selection
              : null),
          projection: insertionProjection,
        }).range
      : reviewInsertionTarget(
          timeline.time,
          timeline.playbackRange ??
            (base.activeSelection.kind === 'none' && base.selection.kind === 'range'
              ? base.selection
              : null)
        ),
    selection: base.activeSelection,
    select: base.setActiveSelection,
    pause: timeline.pause,
    seek: webcamResultClock ? timeline.seekResult : (time) => timeline.seek(time, false),
    seekSource: (time) => timeline.seek(time, false),
    seekResult: timeline.seekResult,
    allowed: () =>
      !base.busy &&
      !presentationPending.current &&
      base.exporter.phase === 'idle' &&
      !base.composer.getCurrent().annotation &&
      base.advanced.ui.mode === 'advanced',
  });
  const watermark = useReviewWatermark({
    session: base.session,
    settings: base.advanced.watermark,
    flushAdvanced: base.advancedState.flush,
    stageSettings: base.advancedState.setWatermark,
    pause: timeline.pause,
    allowed: () =>
      !base.busy &&
      !presentationPending.current &&
      base.exporter.phase === 'idle' &&
      base.advanced.ui.mode === 'advanced',
  });
  const presentation = useReviewPresentation({
    session: base.session,
    settings: base.advanced.presentation,
    flushAdvanced: base.advancedState.flush,
    stageSettings: base.advancedState.setPresentation,
    pause: timeline.pause,
    allowed: () =>
      !base.busy &&
      !webcam.pending &&
      !watermark.pending &&
      base.exporter.phase === 'idle' &&
      !base.composer.getCurrent().annotation &&
      base.advanced.ui.mode === 'advanced',
  });
  const features = useMemo(
    () =>
      resolveQuickEditEffectiveState(base.advanced, {
        facts: previewHistory.telemetry,
        source: resource.source,
      }),
    [base.advanced, previewHistory.telemetry, resource.source]
  );
  presentationPending.current = presentation.pending;
  const annotationEffects = useReviewAnnotationEffects({
    commands,
    session: base.session,
    lane: base.advanced.annotationEffects,
    setLane: base.advancedState.setAnnotationEffects,
    flush: base.advancedState.flush,
    beforeAction: base.beforeAction,
    performAction: base.performAction,
    pause: timeline.pause,
    select: base.setActiveSelection,
    allowed: () =>
      !base.actionBusy &&
      !base.backgroundImport.pending &&
      !webcam.pending &&
      !watermark.pending &&
      !presentation.pending &&
      base.exporter.phase === 'idle' &&
      !base.composer.getCurrent().annotation &&
      base.advanced.ui.mode === 'advanced',
  });
  const beforeAction = (action: () => void) => {
    if (!annotationEffects.hasPending()) return base.beforeAction(action);
    void annotationEffects
      .flush()
      .then(() => base.beforeAction(action))
      .catch(() => base.setMessage(translate('gallery.videoReview.saveFailed')));
  };
  base.commandAdmission.current = beforeAction;
  return {
    ...base,
    ...timeline,
    commands,
    history,
    historyTelemetry,
    setHistoryRange,
    cursorArchiveAvailable: !!resource.telemetry?.cursorTrajectory?.totalSamples,
    features,
    performAction: async (action: () => Promise<boolean>) => {
      await annotationEffects.flush();
      return await base.performAction(action);
    },
    webcam,
    watermark,
    presentation,
    annotationEffects,
    run: async (
      action: () => Promise<unknown>,
      success?: string,
      options?: { durableNote: true }
    ) => {
      try {
        await annotationEffects.flush();
        return await base.run(action, success, options);
      } catch {
        base.setMessage(translate('gallery.videoReview.saveFailed'));
      }
    },
    beforeAction,
    busy:
      base.busy ||
      webcam.pending ||
      watermark.pending ||
      presentation.pending ||
      annotationEffects.pending,
  };
}

/** Owns the review session and local selection state. */
function useReviewEditorBase(resource: LoadedReview) {
  const { session, source } = resource;
  const snapshot = useReviewSnapshot(session);
  const composer = useReviewComposer(session);
  const exporter = useReviewExport(resource);
  const stopForEdit = useRef<() => void>(() => {});
  const commandPort = useRef<ReviewCommandPort | null>(null);
  const commandRuntime = useRef<{
    readPosition(): ReviewCommandContext['position'];
    pauseAt(position: ReviewCommandContext['position']): boolean;
    readRange(): ReviewCommandContext['playbackRange'];
    readUIIntent(): { position: ReviewCommandContext['position']; playing: boolean };
  } | null>(null);
  const selectionNavigation = useRef<
    (selection: ReviewSelection, context: ReviewCommandContext) => void
  >(() => {});
  const beforeEdit = useCallback(() => stopForEdit.current(), []);
  const advancedState = useReviewAdvanced(session, beforeEdit);
  const advanced = advancedState.advanced;
  const features = useMemo(
    () => resolveQuickEditEffectiveState(advanced, { facts: resource.telemetry, source }),
    [advanced, resource.telemetry, source]
  );
  const [selection, publishSelection] = useState<ReviewAnchor>(
    composer.annotation?.anchor ?? { kind: 'point', time: 0 }
  );
  const selectionRef = useRef(selection);
  const setSelection = useCallback((next: SetStateAction<ReviewAnchor>) => {
    const value = typeof next === 'function' ? next(selectionRef.current) : next;
    selectionRef.current = value;
    publishSelection(value);
  }, []);
  const [selected, setSelected] = useState<ReviewAnnotation | null>(null);
  const [hovered, setHovered] = useState<ReviewAnnotation | null>(null);
  const [voiceoverSilent, setVoiceoverSilent] = useState(false);
  const { selection: activeSelection, setSelection: selectActive } = useReviewSelection();
  const activeSelectionRef = useRef(activeSelection);
  activeSelectionRef.current = activeSelection;
  const {
    actionBusy,
    isBusy,
    setBusy,
    message,
    setMessage,
    run: raw,
    canStart,
  } = useReviewActionStatus(composer);
  const transitions = useReviewNoteTransitions({
    isNew: () => !!composer.getCurrent().annotation && !composer.getCurrent().before,
    finishNew: composer.finishNew,
    blocked: isBusy,
    leaveAllowed: () => !snapshot.error,
    onFailure: () => setMessage(translate('gallery.videoReview.saveFailed')),
  });
  const speechGuardRef = useRef<ReturnType<typeof createReviewSpeechEditGuard> | null>(null);
  speechGuardRef.current ??= createReviewSpeechEditGuard(() =>
    setMessage(translate('gallery.videoReview.saveFailed'))
  );
  const speechGuard = speechGuardRef.current;
  const performAction = async (action: () => Promise<boolean>): Promise<boolean | undefined> =>
    await speechGuard.perform(async () => await transitions.perform(action));
  const beforeAction: typeof transitions.beforeAction = (action) => {
    void speechGuard.perform(() => transitions.beforeAction(action));
  };
  const commandAdmission = useRef(beforeAction);
  commandAdmission.current = beforeAction;
  const commandRead = useRef<() => Omit<ReviewCommandContext, 'position'> | null>(() => null);
  commandRead.current = () => {
    if (!commandRuntime.current) return null;
    const accepted = session.getSnapshot();
    return {
      scope: {
        session,
        sourceAssetId: accepted.snapshot.workspace.sourceAssetId,
        resource: resource.file,
        sourceUrl: resource.url,
        sourceDuration: resource.source.duration,
      },
      document: { ...accepted.document, advancedContent: advancedState.readCurrentContent() },
      advanced: advancedState.readCurrent(),
      selection: activeSelectionRef.current,
      timelineSelection: selectionRef.current,
      playbackRange: commandRuntime.current.readRange(),
    };
  };
  const commands = useMemo(
    () =>
      createReviewCommandPort({
        read: () => {
          const current = commandRead.current();
          return current?.scope.session === session && current.scope.resource === resource.file
            ? current
            : null;
        },
        readPosition: () => {
          if (!commandRuntime.current) throw new Error('Review transport is unavailable.');
          return commandRuntime.current.readPosition();
        },
        pauseAt: (position) => commandRuntime.current?.pauseAt(position) ?? false,
        beforeAction: (action) => commandAdmission.current(action),
      }),
    [session, resource.file]
  );
  commandPort.current = commands;
  const setActiveSelection = (
    next: SetStateAction<ReviewSelection>,
    context?: ReviewCommandContext
  ) => {
    const selection = typeof next === 'function' ? next(activeSelectionRef.current) : next;
    const apply = (captured?: ReviewCommandContext) => {
      advancedState.endTyping();
      if (typeof next !== 'function' && selection.kind !== 'none' && captured)
        selectionNavigation.current(selection, captured);
      activeSelectionRef.current = selection;
      selectActive(selection);
    };
    if (selection.kind === 'none') {
      commandAdmission.current(() => apply());
      return;
    }
    const commands = commandPort.current;
    if (!commands) return;
    if (context) {
      const intent = commandRuntime.current?.readUIIntent();
      if (
        !commands.isCurrent(context, 'source') ||
        !intent ||
        !reviewCommandCanPublishSelection(context, intent.position, intent.playing)
      )
        return false;
      apply(context);
      return true;
    }
    const captured = commands.capture();
    if (captured) commands.admit(captured, apply);
  };
  const run = (action: () => Promise<unknown>, success?: string, options?: { durableNote: true }) =>
    Promise.resolve(
      speechGuard.perform(() =>
        options?.durableNote
          ? raw(async () => {
              await composer.finishNew({ durable: true });
              await action();
            }, success)
          : transitions.perform(() => raw(action, success))
      )
    );
  const backgroundImport = useReviewBackgroundImport({
    advanced: advancedState,
    session,
    allowed: () =>
      !actionBusy &&
      exporter.phase === 'idle' &&
      !composer.getCurrent().annotation &&
      advanced.ui.mode === 'advanced',
  });
  const busy = actionBusy || backgroundImport.pending || transitions.pending;
  return {
    session,
    stopForEdit,
    commandPort,
    commandRuntime,
    commandAdmission,
    commands,
    readSelection: () => selectionRef.current,
    readActiveSelection: () => activeSelectionRef.current,
    selectionNavigation,
    source,
    snapshot,
    composer,
    exporter,
    advancedState,
    advanced,
    features,
    selection,
    setSelection,
    selected,
    setSelected,
    hovered,
    setHovered,
    voiceoverSilent,
    setVoiceoverSilent,
    activeSelection,
    setActiveSelection,
    backgroundImport,
    actionBusy,
    busy,
    setBusy,
    message,
    setMessage,
    run,
    runComposer: raw,
    performAction,
    beforeAction,
    registerSpeechFlush: speechGuard.register,
    flushSpeech: speechGuard.flush,
    leaveNewNote: transitions.leave,
    canStart,
  };
}

/** Coordinates playback and edit controls from the same time map. */
function useReviewEditorTimeline(
  resource: LoadedReview,
  base: ReturnType<typeof useReviewEditorBase>
) {
  const {
    session,
    source,
    snapshot,
    exporter,
    advancedState,
    advanced,
    features,
    selection,
    setSelection,
    voiceoverSilent,
    activeSelection,
    setActiveSelection,
    setMessage,
    run,
    busy,
    canStart,
  } = base;
  const onTransportFailure = (failure: ReviewTransportFailure) => {
    setMessage(reviewPlaybackFailureMessage(failure));
  };
  const {
    video,
    pause,
    seekResult,
    time,
    onTime,
    playing,
    onMediaPlayback,
    onMediaReady,
    transport,
    readPosition,
    pauseAt,
    playheadClock,
    seek,
    play,
    timeline,
    playbackRange,
    setPlaybackRange,
    onEnded,
    onMediaError,
    recovering,
    preparingPlayback,
    seekRevision,
    navigationRevision,
    actionSoundPreview,
  } = useReviewTransport({
    resource,
    edits: snapshot.document.edits,
    originalAudio: features.originalAudio,
    voiceover: features.voiceover,
    music: features.music,
    ...(advanced.actionAudio ? { actionAudio: advanced.actionAudio } : {}),
    interactionTimeline: advanced.interactionTimeline,
    interactionEnabled: advanced.ui.tracks,
    actionsApplied: features.actionsApplied,
    onSeek: (next) => {
      setSelection((current) =>
        current.kind === 'point' || next < current.start || next >= current.end
          ? { kind: 'point', time: next }
          : current
      );
    },
    boundaries: () =>
      cuts.cutting && advanced.ui.mode !== 'advanced' ? exporter.index?.boundaries : undefined,
    onTransportFailure,
    onTransportRecovered: () =>
      setMessage((message) =>
        message === translate('gallery.videoReview.playbackFailed') ||
        message === translate('gallery.videoReview.audioPlaybackFailed')
          ? null
          : message
      ),
    onActionAudioRecovered: () =>
      setMessage((message) =>
        message === translate('gallery.videoReview.actionAudioResource') ||
        message === translate('gallery.videoReview.actionAudioLimit')
          ? null
          : message
      ),
    onInvalidRange: () => setMessage(translate('gallery.videoReview.emptyPlaybackRange')),
    silent: voiceoverSilent,
  });
  base.commandRuntime.current = {
    readPosition,
    pauseAt,
    readRange: () => transport.getStatusSnapshot().range,
    readUIIntent: () => {
      const status = transport.getStatusSnapshot();
      return { position: status.position, playing: status.playing };
    },
  };
  const { zoom, cuts } = useReviewEditingTools({
    commands: base.commands,
    advancedState,
    zoom: advanced.zoom,
    timelineDuration: timeline.resultDuration,
    activeSelection,
    setActiveSelection,
    sourceDuration: source.duration,
    sourceTime: time,
    file: resource.file,
    timelineSelection: (() => {
      const currentTime = time;
      const target = reviewInsertionTarget(
        currentTime,
        playbackRange ??
          (activeSelection.kind === 'none' && selection.kind === 'range' ? selection : null)
      );
      return target
        ? { kind: 'range' as const, ...target }
        : { kind: 'point' as const, time: currentTime };
    })(),
    exporter,
    edits: snapshot.document.edits,
    pause,
    seek,
    seekResult,
    setTimelineSelection: setSelection,
    onInvalid: () => setMessage(translate('gallery.videoReview.invalidEditRange')),
    session,
    run,
    busy,
    canStart,
  });
  return {
    actionSoundPreview,
    video,
    pause,
    seekResult,
    time,
    onTime,
    playbackRange,
    setPlaybackRange,
    onEnded,
    onMediaError,
    recovering,
    preparingPlayback,
    seekRevision,
    navigationRevision,
    playing,
    onMediaPlayback,
    onMediaReady,
    transport,
    readPosition,
    pauseAt,
    playheadClock,
    seek,
    play,
    timeline,
    zoom,
    cuts,
  };
}

/** Presents the combined editor state to the Gallery bindings. */
function assembleReviewEditorState(
  core: ReturnType<typeof useReviewEditorCore>,
  wiring: ReturnType<typeof useReviewEditorWiring>
) {
  const { snapshot, composer, advancedState, selected, hovered, setActiveSelection, time, cuts } =
    core;
  const { audio, text, canvasComments, comments, telemetry, projected } = wiring;
  return {
    ...core,
    zoomAnchor: reviewSelectionSourceTime(
      core.activeSelection,
      snapshot.document,
      core.advanced,
      core.source.duration,
      projected.markers,
      wiring.exporter.index === null || !!wiring.exporter.index.audioCodec
    ),
    editing: { ...cuts, exporter: wiring.exporter },
    moveHistory: wiring.moveHistory,
    annotationToolCancellation: wiring.annotationToolCancellation,
    audio,
    text,
    canvasComments,
    telemetry,
    ...reviewAdvancedControls(advancedState, setActiveSelection, core.beforeAction),
    projected,
    insertionPoint: (at: number) => {
      const path = wiring.cursorFocusPath;
      const segment = path.segments.find((part) => at >= part.start && at <= part.end);
      return segment ? evaluateCursorFocusSegment(segment, at, path.smoothing) : null;
    },
    cursorFocusPath: wiring.cursorFocusPath,
    cursorFocusKeys: wiring.cursorFocusKeys,
    selectCursorFocusKey: (id: string | undefined, time: number) => {
      const context = core.commands.capture();
      if (context)
        core.commands.admit(context, () => {
          if (setActiveSelection({ kind: 'cursor-focus', id: id ?? '', time }, context) !== false)
            core.setSelection({ kind: 'point', time });
        });
    },
    moveCursorFocusKey: (key: (typeof wiring.cursorFocusKeys)[number], time: number) =>
      core.beforeAction(() => {
        const moved = moveCursorFocusTimelineKey(wiring.cursorFocusPath, key, time);
        advancedState.setCursorFocusPath(moved.path);
        if (core.activeSelection.kind === 'cursor-focus' && core.activeSelection.id === key.id)
          setActiveSelection(() => ({ kind: 'cursor-focus', id: moved.id, time: moved.time }));
      }),
    addCursorFocusKey: (requestedTime: number) => {
      const context = core.commands.capture();
      if (context)
        core.commands.admit(context, () => {
          const time =
            reviewInsertionTarget(requestedTime, context.playbackRange)?.start ?? requestedTime;
          const id = crypto.randomUUID();
          const path = resolveReviewCursorFocusPath(
            core.historyTelemetry,
            core.source,
            context.advanced.cursorFocusPath
          );
          advancedState.setCursorFocusPath(
            addReviewCursorFocusKey(path, time, context.scope.sourceDuration, id)
          );
          if (setActiveSelection({ kind: 'cursor-focus', id, time }, context) !== false)
            core.setSelection({ kind: 'point', time });
        });
    },
    selectComment: (annotation: ReviewAnnotation) => {
      const context = core.commands.capture();
      if (context)
        core.commands.admit(context, () => {
          comments.select(annotation, context);
          setActiveSelection({ kind: 'annotation', id: annotation.id }, context);
        });
    },
    add: (marker?: ReviewTelemetryMarker) => comments.add(marker),
    displayRegion: reviewRegion(
      time,
      composer.annotation,
      hovered,
      selected,
      snapshot.document.annotations
    ),
  };
}

/** Keeps mode changes and the controls for dormant advanced content together. */
function reviewAdvancedControls(
  advancedState: ReturnType<typeof useReviewAdvanced>,
  setActiveSelection: ReturnType<typeof useReviewSelection>['setSelection'],
  beforeAction: ReturnType<typeof useReviewNoteTransitions>['beforeAction']
) {
  return {
    setCursorFocusPath: advancedState.setCursorFocusPath,
    setCameraFollowDefaults: advancedState.setCameraFollowDefaults,
    setMode: (mode: 'basic' | 'advanced') =>
      beforeAction(() => {
        setActiveSelection({ kind: 'none' });
        advancedState.setMode(mode);
      }),
    setTrackVisibility: advancedState.setTrackVisibility,
    setOverlaysVisible: advancedState.setOverlaysVisible,
    setWorkspaceColor: advancedState.setWorkspaceColor,
    setTimelinePreferences: advancedState.setTimelinePreferences,
    setInteractionTimeline: advancedState.setInteractionTimeline,
    setKeyAnimations: advancedState.setKeyAnimations,
    setActionAudio: advancedState.setActionAudio,
    setActionsEnabled: advancedState.setActionsEnabled,
    setClickAnimations: advancedState.setClickAnimations,
    setBackground: advancedState.setBackground,
    backgroundPreview: advancedState.backgroundPreview,
    previewBackground: advancedState.previewBackground,
    setCanvas: advancedState.setCanvas,
    setWindowHeader: advancedState.setWindowHeader,
    setSourceFilters: advancedState.setSourceFilters,
    setCursorMotions: advancedState.setCursorMotions,
    setCursorMotionEnabled: advancedState.setCursorMotionEnabled,
    setText: advancedState.setText,
    setCaptions: advancedState.setCaptions,
    resetAdvanced: advancedState.reset,
    flushAdvanced: advancedState.flush,
    advancedPending: advancedState.pending,
    advancedFailed: advancedState.saveFailed,
    retryAdvanced: advancedState.retry,
  };
}

/** Reports explicit UI action status separately from field recovery; the session serializes writes. */
function useReviewActionStatus(composer: ReturnType<typeof useReviewComposer>) {
  const [busy, updateBusy] = useState(false);
  const busyRef = useRef(false);
  const setBusy = (value: boolean) => {
    busyRef.current = value;
    updateBusy(value);
  };
  const [message, setMessage] = useState<string | null>(null);
  const raw = async (action: () => Promise<unknown>, success?: string) => {
    if (busyRef.current) return;
    setBusy(true);
    setMessage(null);
    try {
      await action();
      if (success) setMessage(success);
    } catch {
      setMessage(translate('gallery.videoReview.saveFailed'));
    } finally {
      setBusy(false);
    }
  };
  const canStart = () => {
    if (busyRef.current) return false;
    const current = composer.getCurrent();
    if (!current.annotation || !current.before) return true;
    setMessage(translate('gallery.videoReview.finishComment'));
    return false;
  };
  return {
    actionBusy: busy,
    isBusy: () => busyRef.current,
    setBusy,
    message,
    setMessage,
    run: raw,
    canStart,
  };
}

/** Draft and hover overlays take precedence; saved selections follow current history. */
function reviewRegion(
  time: number,
  draft: ReviewAnnotation | null,
  hovered: ReviewAnnotation | null,
  selected: ReviewAnnotation | null,
  annotations: readonly ReviewAnnotation[]
) {
  const annotation = draft ?? hovered ?? annotations.find((item) => item.id === selected?.id);
  return annotation &&
    (annotation.anchor.kind === 'point'
      ? Math.abs(annotation.anchor.time - time) < 0.05
      : time >= annotation.anchor.start && time <= annotation.anchor.end)
    ? annotation.region
    : undefined;
}
