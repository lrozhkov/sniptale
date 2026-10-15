import { addReviewCursorFocusKey } from '../../features/video/project/cursor-focus-path/authoring';
import { useReviewAnnotationEffects } from './annotation-effects-editor';
import { useReviewPresentation } from './use-review-presentation';
import { useReviewWatermark } from './use-review-watermark';
import { createReviewSpeechEditGuard } from './speech-edit-guard';
import { scheduleReviewKeys } from '../../features/video/review/key-animation';
import { scheduleReviewClicks } from '../../features/video/review/click-animation';
import { useReviewNoteTransitions } from './note-transitions';
import { useMemo, useRef, useState } from 'react';
import { translate } from '../../platform/i18n';
import type { ReviewAnchor, ReviewAnnotation } from '../../features/video/review/types';
import type { ReviewTelemetryMarker } from '../../features/video/review/telemetry';
import type { ReviewActionAudioUnavailable } from '../../features/video/review/action-audio';
import { useReviewBackgroundImport } from './use-review-background';
import { useReviewComposer, useReviewSnapshot, type LoadedReview } from './use-session';
import { useReviewExport } from './use-export';
import { useReviewAdvanced } from './use-advanced';
import { resolveQuickEditEffectiveState } from '../../features/video/review/advanced/effective';
import { useReviewTransport } from './use-review-transport';
import { reviewSelectionSourceTime, useReviewSelection } from './use-review-selection';
import { useReviewEditorWiring } from './use-review-wiring';
import { useReviewEditingTools } from './use-review-editing';
import { useReviewWebcamEditor } from './webcam-editor';
import { computeQuickEditSceneSize } from '../../features/video/review/advanced/scene';

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
    time,
    seek,
    play,
    timeline,
    zoom,
    cuts,
  } = core;
  const wiring = useReviewEditorWiring({
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
    timelineDuration: timeline.resultDuration,
    busy,
    canStart,
    run,
    composer,
    beforeAction: core.beforeAction,
    playbackRange: core.playbackRange,
    video,
    seek,
    setTimelineSelection: setSelection,
    setCutting: cuts.setCutting,
    telemetry: resource.telemetry,
    sourceDuration: source.duration,
    sourceGeometry: source,
    actionsVisible: advanced.ui.tracks.actions,
    play,
    timelineSelection: selection,
    cuts,
  });
  const actionsApplied = resolveQuickEditEffectiveState(advanced).actionsApplied;
  const clickCues = useMemo(
    () =>
      scheduleReviewClicks(
        wiring.projected.markers,
        actionsApplied ? (advanced.clickAnimations ?? []) : [],
        core.timeline.timeMap.getSegments()
      ),
    [wiring.projected.markers, actionsApplied, advanced.clickAnimations, core.timeline.timeMap]
  );
  const keyCues = useMemo(
    () =>
      scheduleReviewKeys(
        wiring.projected.markers,
        actionsApplied ? (advanced.keyAnimations ?? []) : [],
        core.timeline.timeMap.getSegments()
      ),
    [wiring.projected.markers, actionsApplied, advanced.keyAnimations, core.timeline.timeMap]
  );
  return { ...assembleReviewEditorState(core, wiring), clickCues, keyCues };
}

/** Combines session state with the timeline transport and editing controls. */
function useReviewEditorCore(resource: LoadedReview) {
  const base = useReviewEditorBase(resource);
  const timeline = useReviewEditorTimeline(resource, base);
  const presentationPending = useRef(false);
  const webcam = useReviewWebcamEditor({
    session: base.session,
    advanced: base.advancedState,
    scene: computeQuickEditSceneSize({
      source: resource.source,
      background: base.features.background,
      canvas: base.features.canvas,
      windowHeader: base.features.windowHeader,
    }),
    sourceDuration: resource.source.duration,
    time: timeline.time,
    selection: base.activeSelection,
    select: base.setActiveSelection,
    pause: () => timeline.video.current?.pause(),
    seek: (time) => timeline.seek(time, false),
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
    pause: () => timeline.video.current?.pause(),
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
    pause: () => timeline.video.current?.pause(),
    allowed: () =>
      !base.busy &&
      !webcam.pending &&
      !watermark.pending &&
      base.exporter.phase === 'idle' &&
      !base.composer.getCurrent().annotation &&
      base.advanced.ui.mode === 'advanced',
  });
  presentationPending.current = presentation.pending;
  const annotationEffects = useReviewAnnotationEffects({
    session: base.session,
    lane: base.advanced.annotationEffects,
    setLane: base.advancedState.setAnnotationEffects,
    flush: base.advancedState.flush,
    beforeAction: base.beforeAction,
    performAction: base.performAction,
    pause: () => timeline.video.current?.pause(),
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
  return {
    ...base,
    ...timeline,
    performAction: async (action: () => Promise<boolean>) => {
      await annotationEffects.flush();
      return await base.performAction(action);
    },
    webcam,
    watermark,
    presentation,
    annotationEffects,
    run: async (action: () => Promise<unknown>, success?: string) => {
      try {
        await annotationEffects.flush();
        return await base.run(action, success);
      } catch {
        base.setMessage(translate('gallery.videoReview.saveFailed'));
      }
    },
    beforeAction: (action: () => void) => {
      if (!annotationEffects.hasPending()) return base.beforeAction(action);
      void annotationEffects
        .flush()
        .then(() => base.beforeAction(action))
        .catch(() => base.setMessage(translate('gallery.videoReview.saveFailed')));
    },
    setActiveSelection: (next: Parameters<typeof base.setActiveSelection>[0]) => {
      if (!annotationEffects.hasPending()) return base.setActiveSelection(next);
      void annotationEffects
        .flush()
        .then(() => base.setActiveSelection(next))
        .catch(() => base.setMessage(translate('gallery.videoReview.saveFailed')));
    },
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
  const advancedState = useReviewAdvanced(session);
  const advanced = advancedState.advanced;
  const features = useMemo(
    () => resolveQuickEditEffectiveState(advanced, { facts: resource.telemetry, source }),
    [advanced, resource.telemetry, source]
  );
  const [selection, setSelection] = useState<ReviewAnchor>(
    composer.annotation?.anchor ?? { kind: 'point', time: 0 }
  );
  const [selected, setSelected] = useState<ReviewAnnotation | null>(null);
  const [hovered, setHovered] = useState<ReviewAnnotation | null>(null);
  const [voiceoverSilent, setVoiceoverSilent] = useState(false);
  const { selection: activeSelection, setSelection: selectActive } = useReviewSelection();
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
  const setActiveSelection: typeof selectActive = (next) => {
    advancedState.endTyping();
    void speechGuard.perform(() => selectActive(next));
  };
  const run = (action: () => Promise<unknown>, success?: string) =>
    Promise.resolve(speechGuard.perform(() => transitions.perform(() => raw(action, success))));
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
  const onTransportFailure = (reason?: ReviewActionAudioUnavailable['reason']) => {
    if (reason) video.current?.pause();
    setMessage(
      translate(
        reason === 'voice-limit'
          ? 'gallery.videoReview.actionAudioLimit'
          : reason
            ? 'gallery.videoReview.actionAudioResource'
            : 'gallery.videoReview.playbackFailed'
      )
    );
  };
  const {
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
    navigationRevision,
    actionSoundPreview,
  } = useReviewTransport({
    resource,
    edits: snapshot.document.edits,
    originalAudio: features.originalAudio,
    voiceover: features.voiceover,
    music: features.music,
    ...(advanced.actionAudio ? { actionAudio: advanced.actionAudio } : {}),
    actionsApplied: features.actionsApplied,
    onSeek: (next) => {
      if (selection.kind === 'point') setSelection({ kind: 'point', time: next });
    },
    boundaries: () =>
      cuts.cutting && advanced.ui.mode !== 'advanced' ? exporter.index?.boundaries : undefined,
    onTransportFailure,
    onTransportRecovered: () =>
      setMessage((message) =>
        message === translate('gallery.videoReview.playbackFailed') ? null : message
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
  const { zoom, cuts } = useReviewEditingTools({
    advancedState,
    zoom: advanced.zoom,
    timelineDuration: timeline.resultDuration,
    activeSelection,
    setActiveSelection,
    sourceDuration: source.duration,
    timelineSelection: selection,
    exporter,
    edits: snapshot.document.edits,
    pause: () => video.current?.pause(),
    seek,
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
    time,
    onTime,
    playbackRange,
    setPlaybackRange,
    onEnded,
    onMediaError,
    recovering,
    seekRevision,
    navigationRevision,
    playing,
    setPlaying,
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
    cursorFocusPath: wiring.cursorFocusPath,
    cursorFocusKeys: wiring.cursorFocusKeys,
    selectCursorFocusKey: (id: string, time: number) =>
      core.beforeAction(() => {
        core.setSelection({ kind: 'point', time });
        setActiveSelection({ kind: 'cursor-focus', id, time });
        core.seek(time, false);
      }),
    addCursorFocusKey: (time: number) =>
      core.beforeAction(() => {
        const id = crypto.randomUUID();
        advancedState.setCursorFocusPath(
          addReviewCursorFocusKey(wiring.cursorFocusPath, time, core.source.duration, id)
        );
        core.setSelection({ kind: 'point', time });
        setActiveSelection({ kind: 'cursor-focus', id, time });
        core.seek(time, false);
      }),
    selectComment: (annotation: ReviewAnnotation) => {
      core.beforeAction(() => {
        comments.select(annotation);
        setActiveSelection({ kind: 'annotation', id: annotation.id });
      });
    },
    add: (marker?: ReviewTelemetryMarker) => core.beforeAction(() => comments.add(marker)),
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
    setTrackLocked: advancedState.setTrackLocked,
    setOverlaysVisible: advancedState.setOverlaysVisible,
    setWorkspaceColor: advancedState.setWorkspaceColor,
    setKeyAnimations: advancedState.setKeyAnimations,
    setActionAudio: advancedState.setActionAudio,
    setActionsEnabled: (enabled: boolean) => advancedState.setTrackVisibility('actions', enabled),
    setClickAnimations: advancedState.setClickAnimations,
    setBackground: advancedState.setBackground,
    backgroundPreview: advancedState.backgroundPreview,
    previewBackground: advancedState.previewBackground,
    setCanvas: advancedState.setCanvas,
    setWindowHeader: advancedState.setWindowHeader,
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
