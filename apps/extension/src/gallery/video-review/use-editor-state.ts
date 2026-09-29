import { useMemo, useState } from 'react';
import { translate } from '../../platform/i18n';
import type { ReviewAnchor, ReviewAnnotation } from '../../features/video/review/types';
import type { ReviewTelemetryMarker } from '../../features/video/review/telemetry';
import { useReviewBackgroundImport } from './use-review-background';
import { useReviewComposer, useReviewSnapshot, type LoadedReview } from './use-session';
import { useReviewExport } from './use-export';
import { useReviewAdvanced } from './use-advanced';
import { resolveQuickEditEffectiveState } from '../../features/video/review/advanced/effective';
import { useReviewTransport } from './use-review-transport';
import { useReviewSelection } from './use-review-selection';
import { useReviewEditorWiring } from './use-review-wiring';
import { useReviewEditingTools } from './use-review-editing';

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
    activeSelection,
    setActiveSelection,
    clearAnnotation: setSelected,
    time,
    timelineDuration: timeline.resultDuration,
    busy,
    canStart,
    run,
    composer,
    video,
    seek,
    setTimelineSelection: setSelection,
    setCutting: cuts.setCutting,
    telemetry: resource.telemetry,
    sourceDuration: source.duration,
    actionsVisible: advanced.ui.tracks.actions,
    play,
    timelineSelection: selection,
    cuts,
  });
  return assembleReviewEditorState(core, wiring);
}

/** Combines session state with the timeline transport and editing controls. */
function useReviewEditorCore(resource: LoadedReview) {
  const base = useReviewEditorBase(resource);
  const timeline = useReviewEditorTimeline(resource, base);
  return { ...base, ...timeline };
}

/** Owns the review session and local selection state. */
function useReviewEditorBase(resource: LoadedReview) {
  const { session, source } = resource;
  const snapshot = useReviewSnapshot(session);
  const composer = useReviewComposer(session);
  const exporter = useReviewExport(resource);
  const advancedState = useReviewAdvanced(session);
  const advanced = advancedState.advanced;
  const features = useMemo(() => resolveQuickEditEffectiveState(advanced), [advanced]);
  const [selection, setSelection] = useState<ReviewAnchor>(
    composer.annotation?.anchor ?? { kind: 'point', time: 0 }
  );
  const [selected, setSelected] = useState<ReviewAnnotation | null>(null);
  const [hovered, setHovered] = useState<ReviewAnnotation | null>(null);
  const [voiceoverSilent, setVoiceoverSilent] = useState(false);
  const { selection: activeSelection, setSelection: setActiveSelection } = useReviewSelection();
  const { actionBusy, setBusy, message, setMessage, run, canStart } = useReviewActionStatus(
    composer.annotation
  );
  const backgroundImport = useReviewBackgroundImport({
    advanced: advancedState,
    session,
    allowed: () =>
      !actionBusy &&
      exporter.phase === 'idle' &&
      !composer.annotation &&
      advanced.ui.mode === 'advanced',
  });
  const busy = actionBusy || backgroundImport.pending;
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
    busy,
    setBusy,
    message,
    setMessage,
    run,
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
  const onTransportFailure = () => setMessage(translate('gallery.videoReview.playbackFailed'));
  const { video, time, onTime, playing, setPlaying, seek, play, timeline } = useReviewTransport({
    resource,
    edits: snapshot.document.edits,
    originalAudio: features.originalAudio,
    voiceover: features.voiceover,
    music: features.music,
    onSeek: (next) => {
      if (selection.kind === 'point') setSelection({ kind: 'point', time: next });
    },
    boundaries: () =>
      cuts.cutting && advanced.ui.mode !== 'advanced' ? exporter.index?.boundaries : undefined,
    onTransportFailure,
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
    video,
    time,
    onTime,
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
  const {
    snapshot,
    composer,
    advancedState,
    selection,
    selected,
    hovered,
    setActiveSelection,
    time,
    cuts,
  } = core;
  const { audio, canvasComments, comments, telemetry, projected } = wiring;
  return {
    ...core,
    editing: { ...cuts, exporter: wiring.exporter },
    moveHistory: wiring.moveHistory,
    audio,
    canvasComments,
    telemetry,
    ...reviewAdvancedControls(advancedState, setActiveSelection),
    projected,
    selectComment: (annotation: ReviewAnnotation) => {
      comments.select(annotation);
      setActiveSelection({ kind: 'annotation', id: annotation.id });
    },
    add: (marker?: ReviewTelemetryMarker) => comments.add(selection, marker),
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
  setActiveSelection: ReturnType<typeof useReviewSelection>['setSelection']
) {
  return {
    setMode: (mode: 'basic' | 'advanced') => {
      setActiveSelection({ kind: 'none' });
      advancedState.setMode(mode);
    },
    setTrackVisibility: advancedState.setTrackVisibility,
    setOverlaysVisible: advancedState.setOverlaysVisible,
    setBackground: advancedState.setBackground,
    setCanvas: advancedState.setCanvas,
    resetAdvanced: advancedState.reset,
    flushAdvanced: advancedState.flush,
    advancedPending: advancedState.pending,
    advancedFailed: advancedState.saveFailed,
    retryAdvanced: advancedState.retry,
  };
}

/** Reports explicit UI action status separately from field recovery; the session serializes writes. */
function useReviewActionStatus(annotation: ReviewAnnotation | null) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const run = async (action: () => Promise<unknown>, success?: string) => {
    if (busy) return;
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
    if (!annotation) return true;
    setMessage(translate('gallery.videoReview.finishComment'));
    return false;
  };
  return { actionBusy: busy, setBusy, message, setMessage, run, canStart };
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
