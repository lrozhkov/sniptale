import { ReviewSelectedProperties } from './selected-properties';
import { useEffect, useMemo, useRef, useState } from 'react';
import { translate, useAppLocale } from '../../platform/i18n';
import type { ReviewAnchor, ReviewAnnotation } from '../../features/video/review/types';
import type { ReviewTelemetryMarker } from '../../features/video/review/telemetry';
import { ReviewButton } from './controls';
import { useReviewWaveforms } from './audio-waveform';
import { useReviewBackgroundImport } from './use-review-background';
import { ReviewStageBinding } from './stage-binding';
import { ReviewTimelineBinding } from './timeline-binding';
import { ReviewInspector } from './inspector';
import { ReviewComposer } from './composer';
import {
  useLoadedReview,
  useReviewComposer,
  useReviewSnapshot,
  type LoadedReview,
} from './use-session';
import { exportReviewReport } from './report-actions';
import { useReviewExport } from './use-export';
import { useReviewAdvanced } from './use-advanced';
import { ReviewRenderOptions, ReviewEditActions } from './edit-actions';
import { resolveQuickEditEffectiveState } from '../../features/video/review/advanced/effective';
import { useReviewTransport } from './use-review-transport';
import { ReviewSceneProperties } from './advanced-panels';
import type { useCanvasComments } from './use-canvas-comments';
import { useReviewSelection } from './use-review-selection';
import type { useReviewAudio } from './use-review-audio';
import { ReviewVoiceoverRecording, useReviewEditorAudio } from './voiceover-recording';
import { useReviewEditorWiring } from './use-review-wiring';
import { useReviewEditingTools } from './use-review-editing';

function useReviewEditorState(resource: LoadedReview) {
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
  });
  const { zoom, cuts } = useReviewEditingTools({
    advancedState,
    zoom: advanced.zoom,
    timelineDuration: timeline.resultDuration,
    activeSelection,
    setActiveSelection,
    sourceDuration: source.duration,
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
  const { audio, canvasComments, comments, telemetry, projected } = wiring;
  return {
    editing: { ...cuts, exporter: wiring.exporter },
    backgroundImport,
    session,
    source,
    snapshot,
    composer,
    video,
    time,
    onTime,
    playing,
    setPlaying,
    selection,
    setSelection,
    activeSelection,
    setActiveSelection,
    audio,
    canvasComments,
    selected,
    setHovered,
    telemetry,
    advanced,
    features,
    timeline,
    ...reviewAdvancedControls(advancedState, setActiveSelection),
    zoom,
    projected,
    busy,
    setBusy,
    message,
    setMessage,
    seek,
    play,
    run,
    canStart,
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

type InspectorState = Pick<
  ReturnType<typeof useReviewEditorState>,
  | 'selection'
  | 'advancedPending'
  | 'advancedFailed'
  | 'retryAdvanced'
  | 'setMode'
  | 'backgroundImport'
  | 'activeSelection'
  | 'projected'
  | 'setActiveSelection'
  | 'editing'
  | 'session'
  | 'snapshot'
  | 'composer'
  | 'video'
  | 'time'
  | 'selected'
  | 'setHovered'
  | 'busy'
  | 'setBusy'
  | 'message'
  | 'setMessage'
  | 'seek'
  | 'run'
  | 'canStart'
  | 'selectComment'
  | 'add'
  | 'advanced'
  | 'zoom'
  | 'timeline'
  | 'setBackground'
  | 'setCanvas'
  | 'setOverlaysVisible'
  | 'resetAdvanced'
  | 'flushAdvanced'
>;

/** Export control strip: one presentation owner for phase, progress, and blocker hints. */
function ReviewInspectorActions({
  editing,
  snapshot,
  busy,
  composerBusy,
  onExport,
}: {
  editing: InspectorState['editing'];
  snapshot: InspectorState['snapshot'];
  busy: boolean;
  composerBusy: boolean;
  onExport(): void;
}) {
  const plan = editing.exporter.plan();
  const settings =
    plan.kind === 'ready' && plan.video === 'render' ? (
      <ReviewRenderOptions
        exporter={editing.exporter}
        busy={busy || composerBusy || editing.exporter.phase !== 'idle'}
      />
    ) : null;
  return (
    <>
      <ReviewEditActions
        settings={settings}
        available={!!editing.exporter.index && editing.exporter.index.boundaries.length >= 2}
        hasEdits={snapshot.document.edits.length > 0}
        busy={busy || composerBusy}
        phase={editing.exporter.phase}
        progress={editing.exporter.progress}
        failed={editing.exporter.failed}
        hasResult={!!editing.exporter.result}
        audioUnavailable={
          !!editing.exporter.index?.audioCodec &&
          !editing.exporter.index.processedAudioCodec &&
          snapshot.document.edits.some((edit) => edit.kind === 'speed')
        }
        advancedBlockers={editing.exporter.blocked}
        reencodeReasons={editing.exporter.reencode()}
        onExport={onExport}
        onCancel={editing.exporter.cancel}
        onDownload={editing.exporter.download}
      />
    </>
  );
}

async function moveReviewHistory(args: {
  direction: 'undo' | 'redo';
  flushAdvanced(): Promise<void>;
  flushTexts(): Promise<void>;
  session: ReturnType<
    typeof import('../../workflows/video-review/session').createVideoReviewSession
  >;
}) {
  await args.flushAdvanced();
  await args.flushTexts();
  await args.session.flush();
  await args.session.history(args.direction);
}

function reviewErrorMessage(error: ReturnType<typeof useReviewEditorState>['snapshot']['error']) {
  if (error === 'conflict') return translate('gallery.videoReview.conflict');
  if (error === 'changed-source') return translate('gallery.videoReview.sourceChanged');
  if (error === 'missing-media') return translate('gallery.videoReview.missingMedia');
  return translate('gallery.videoReview.saveFailed');
}

function ReviewInspectorBinding({
  resource,
  state,
  canvasComments,
  audio,
  onBack,
}: {
  resource: LoadedReview;
  state: InspectorState;
  canvasComments: ReturnType<typeof useCanvasComments>;
  audio: ReturnType<typeof useReviewAudio>;
  onBack(): void;
}) {
  const { editing, session, snapshot, composer, video, busy, run } = state;
  const onHistory = (direction: 'undo' | 'redo') =>
    void run(() =>
      moveReviewHistory({
        direction,
        flushAdvanced: state.flushAdvanced,
        flushTexts: canvasComments.flushTexts,
        session,
      })
    );
  return (
    <ReviewInspector
      filename={resource.filename}
      annotations={snapshot.document.annotations}
      selectedId={state.selected?.id ?? null}
      busy={busy || editing.exporter.phase !== 'idle'}
      actions={
        <ReviewInspectorActions
          editing={editing}
          snapshot={snapshot}
          busy={busy}
          composerBusy={!!composer.annotation}
          onExport={() => {
            video.current?.pause();
            void editing.exporter.start();
          }}
        />
      }
      canUndo={!composer.annotation && snapshot.snapshot.workspace.cursor > 0}
      canRedo={
        !composer.annotation &&
        snapshot.snapshot.workspace.cursor < snapshot.snapshot.workspace.history.length
      }
      settingsAvailable={state.advanced.ui.mode === 'advanced'}
      contextKey={reviewInspectorContext(state)}
      composer={
        composer.annotation ? (
          <ReviewCommentComposer state={state} annotation={composer.annotation} />
        ) : null
      }
      selectionLabel={reviewSelectionLabel(state)}
      scene={
        <ReviewSceneProperties
          background={state.advanced.background}
          canvas={state.advanced.canvas}
          source={resource.source}
          onCanvas={state.setCanvas}
          audio={state.advanced.audio}
          hasOriginalAudio={editing.exporter.index === null || !!editing.exporter.index.audioCodec}
          onOriginalVolume={(volume) => audio.setOriginal({ volume })}
          onLaneVolume={audio.setLaneVolume}
          busy={busy || editing.exporter.phase !== 'idle'}
          pending={state.backgroundImport.pending}
          failed={state.backgroundImport.failed}
          onImportImage={state.backgroundImport.importImage}
          setBackground={state.setBackground}
        />
      }
      saveStatus={
        state.advancedFailed
          ? 'failed'
          : state.advancedPending || snapshot.pending > 0
            ? 'saving'
            : 'saved'
      }
      onRetry={() => void run(state.retryAdvanced)}
      recovery={<ReviewConflictRecovery state={state} />}
      message={snapshot.error ? reviewErrorMessage(snapshot.error) : state.message}
      onBack={() => {
        video.current?.pause();
        void run(async () => {
          await composer.flush();
          await state.flushAdvanced();
          await canvasComments.flushTexts();
          await session.flush();
          onBack();
        });
      }}
      onUndo={() => onHistory('undo')}
      onRedo={() => onHistory('redo')}
      rangeSelected={state.selection.kind === 'range'}
      onAdd={state.add}
      onSelect={state.selectComment}
      onHover={state.setHovered}
      onEdit={(annotation) => {
        if (state.canStart()) {
          state.selectComment(annotation);
          composer.change(annotation, annotation);
        }
      }}
      onDelete={(annotation) => {
        if (state.canStart())
          void run(() =>
            session.commit({
              id: crypto.randomUUID(),
              at: Date.now(),
              target: 'annotation',
              before: annotation,
              after: null,
            })
          );
      }}
      onReport={(action) => {
        if (busy) return;
        state.setBusy(true);
        state.setMessage(null);
        void exportReviewReport(resource, action, editing.exporter.result?.receipt)
          .catch(() => state.setMessage(translate('gallery.videoReview.reportFailed')))
          .finally(() => state.setBusy(false));
      }}
    >
      <ReviewSelectedProperties
        advanced={state.advanced}
        selection={state.activeSelection}
        editing={state.editing}
        zoom={state.zoom}
        busy={state.busy}
        markers={state.projected.markers}
        toSourceTime={state.timeline.timeMap.timelineToSource}
        resource={resource}
        audio={audio}
      />
    </ReviewInspector>
  );
}

/** Conflict recovery reloads the document and its staged advanced state together. */
function ReviewConflictRecovery({
  state,
}: {
  state: Pick<InspectorState, 'snapshot' | 'busy' | 'run' | 'composer' | 'resetAdvanced'>;
}) {
  if (state.snapshot.error !== 'conflict') return null;
  return (
    <ReviewButton
      label={translate('gallery.videoReview.reload')}
      disabled={state.busy}
      onClick={() =>
        void state.run(async () => {
          await state.composer.reload();
          state.resetAdvanced();
        })
      }
    />
  );
}

function ReviewCommentComposer({
  state,
  annotation,
}: {
  state: Pick<InspectorState, 'composer' | 'busy' | 'run' | 'selectComment'>;
  annotation: ReviewAnnotation;
}) {
  const { composer, busy, run } = state;
  return (
    <ReviewComposer
      key={annotation.id}
      annotation={annotation}
      busy={busy}
      onChange={composer.change}
      onSave={() =>
        void run(async () => {
          await composer.save();
          state.selectComment(annotation);
        })
      }
      onDiscard={() => void run(composer.discard)}
    />
  );
}

/** Audio lane wiring: import and the recorder reuse the state-owned audio selection. */
function useReviewAudioWiring(state: ReturnType<typeof useReviewEditorState>) {
  const { onImportAudioFile, voiceover } = useReviewEditorAudio({
    busy: state.busy,
    canStart: state.canStart,
    time: state.time,
    resultDuration: state.timeline.resultDuration,
    toOutputTime: state.timeline.toOutputTime,
    onCutPlacement: () => state.setMessage(translate('gallery.videoReview.placementOnCut')),
    video: state.video,
    run: state.run,
    flushAdvanced: state.flushAdvanced,
    audio: state.audio,
  });
  return { onImportAudioFile, voiceover };
}

function ReviewEditor({ resource, onBack }: { resource: LoadedReview; onBack(): void }) {
  const state = useReviewEditorState(resource);
  const { onImportAudioFile, voiceover } = useReviewAudioWiring(state);
  const {
    audio,
    canvasComments,
    editing,
    source,
    snapshot,
    composer,
    video,
    time,
    onTime,
    playing,
    setPlaying,
    selection,
    setSelection,
    telemetry,
    advanced,
    features,
    timeline,
    setTrackVisibility,
    zoom,
    busy,
    setMessage,
    projected,
    seek,
    play,
    selectComment,
    displayRegion,
  } = state;
  const waveforms = useReviewWaveforms(
    resource.file,
    source.duration,
    advanced.audio,
    features.audioTrackVisible,
    editing.exporter.index === null || !!editing.exporter.index.audioCodec
  );
  const zoomRegion = features.zoomTrackVisible ? zoom.selected(advanced.zoom) : null;
  return (
    <div
      className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_320px] grid-rows-[minmax(0,1fr)_auto]
          max-[799px]:grid-cols-1
          max-[799px]:grid-rows-[minmax(280px,45dvh)_minmax(360px,1fr)_auto]
          max-[799px]:overflow-y-auto"
    >
      <main className="flex min-h-0 min-w-0 flex-col overflow-hidden p-3">
        <ReviewStageBinding
          backgroundPending={state.backgroundImport.pending}
          url={resource.url}
          source={source}
          canvas={features.canvas}
          video={video}
          drawing={!!composer.annotation && !playing && !busy}
          region={displayRegion}
          zoomRegions={features.zoomRegions}
          background={features.background}
          outputTime={timeline.sceneOutputTime}
          zoomOverlay={
            zoomRegion && !busy && editing.exporter.phase === 'idle'
              ? zoomRegion.spotlight
                ? undefined
                : zoom.focusOverlay(zoomRegion)
              : undefined
          }
          comments={snapshot.document.canvasComments}
          annotations={snapshot.document.annotations}
          canvasComments={canvasComments}
          overlaysVisible={features.overlaysVisible}
          time={time}
          busy={busy}
          onRegion={(region) => {
            if (composer.annotation && !busy) composer.change({ ...composer.annotation, region });
          }}
          onReady={() => {
            const anchor = composer.annotation?.anchor;
            if (anchor) seek(anchor.kind === 'point' ? anchor.time : anchor.start);
          }}
          onTime={(value) => {
            const next = onTime(value);
            setSelection((current) =>
              current.kind === 'point' ? { kind: 'point', time: next } : current
            );
          }}
          onPlaying={setPlaying}
          onError={() => setMessage(translate('gallery.videoReview.playbackFailed'))}
        />
      </main>
      <ReviewInspectorBinding
        resource={resource}
        state={state}
        canvasComments={canvasComments}
        audio={audio}
        onBack={onBack}
      />
      <div className="col-span-full min-h-0 min-w-0">
        <ReviewTimelineBinding
          editing={editing}
          edits={snapshot.document.edits}
          annotations={snapshot.document.annotations}
          source={source}
          busy={busy}
          composerBusy={!!composer.annotation}
          selection={selection}
          setSelection={setSelection}
          advanced={advanced}
          resultDuration={timeline.resultDuration}
          outputTime={timeline.outputTime}
          toOutputTime={timeline.toOutputTime}
          onCutPlacement={() => setMessage(translate('gallery.videoReview.placementOnCut'))}
          setTrackVisibility={setTrackVisibility}
          setMode={state.setMode}
          telemetryAvailable={projected.markers.length > 0}
          time={time}
          playing={playing}
          markers={telemetry ? projected.markers : []}
          selectedTelemetryRef={
            state.activeSelection.kind === 'telemetry' ? state.activeSelection.ref : undefined
          }
          zoom={zoom}
          audio={audio}
          audioState={advanced.audio}
          waveforms={waveforms}
          audioVisible={features.audioTrackVisible}
          onImportAudioFile={onImportAudioFile}
          onRecordVoiceover={voiceover.open}
          onClearSelection={() => state.setActiveSelection({ kind: 'none' })}
          onMarker={(marker) => {
            if (!state.canStart()) return;
            seek(marker.start, false);
            state.setActiveSelection({ kind: 'telemetry', ref: marker.ref });
          }}
          onComment={selectComment}
          onSeek={seek}
          onPlay={play}
        />
      </div>
      <ReviewVoiceoverRecording
        isOpen={voiceover.recording}
        playhead={voiceover.takeStart ?? time}
        timelineDuration={source.duration}
        onClose={voiceover.close}
        onSyncStart={voiceover.syncStart}
        onSyncStop={voiceover.syncStop}
        onSave={voiceover.save}
      />
    </div>
  );
}

/** Native modal owns focus/inert; Escape cancels drawing, Back alone exits after recovery flush. */
export function VideoReview({ aggregateId, onBack }: { aggregateId: string; onBack(): void }) {
  useAppLocale();
  const dialog = useRef<HTMLDialogElement>(null);
  const { resource, failed, retry } = useLoadedReview(aggregateId);
  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    return () => {
      node?.close();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      aria-label={translate('gallery.videoReview.title')}
      onCancel={(event) => event.preventDefault()}
      style={{
        backgroundColor: 'var(--sniptale-color-surface-canvas)',
        backgroundImage:
          'linear-gradient(var(--sniptale-color-surface-panel), var(--sniptale-color-surface-panel))',
      }}
      className="fixed inset-0 m-auto h-[calc(100dvh-24px)] max-h-none w-[calc(100vw-24px)] max-w-none
          overflow-hidden rounded-[var(--sniptale-radius-lg)] border
          border-[var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-panel)]
          p-0 text-[var(--sniptale-color-text-primary)] backdrop:bg-black/60"
    >
      {resource ? (
        <ReviewEditor resource={resource} onBack={onBack} />
      ) : (
        <div className="space-y-4 p-4">
          <ReviewButton label={translate('gallery.videoReview.back')} onClick={onBack} />
          <p role={failed ? 'alert' : 'status'}>
            {translate(failed ? 'gallery.videoReview.loadFailed' : 'gallery.videoReview.loading')}
          </p>
          {failed ? (
            <ReviewButton label={translate('gallery.videoReview.retry')} onClick={retry} />
          ) : null}
        </div>
      )}
    </dialog>
  );
}

function reviewInspectorContext(state: InspectorState): string {
  if (state.composer.annotation) return `comments:${state.composer.annotation.id}`;
  const selection = state.activeSelection;
  if (selection.kind === 'annotation') return `comments:${selection.id}`;
  if (selection.kind === 'telemetry') return `action:${selection.ref.kind}:${selection.ref.id}`;
  if (state.advanced.ui.mode !== 'advanced') return 'comments';
  const id = 'id' in selection ? selection.id : '';
  return `settings:${selection.kind}:${id}`;
}

function reviewSelectionLabel(state: InspectorState): string | undefined {
  const selection = state.activeSelection;
  if (selection.kind === 'telemetry') return translate('gallery.videoReview.telemetry');
  if (selection.kind === 'zoom')
    return translate(
      state.advanced.zoom.regions.find((region) => region.id === selection.id)?.spotlight
        ? 'gallery.videoReview.focusSpotlight'
        : 'gallery.videoReview.zoomRegionLabel'
    );
  if (selection.kind === 'zoom-link') return translate('gallery.videoReview.zoomLinkSettings');
  if (selection.kind === 'audio')
    return translate(
      selection.lane === 'voiceover'
        ? 'gallery.videoReview.audioVoiceover'
        : 'gallery.videoReview.audioMusic'
    );
  if (selection.kind === 'edit' && state.editing.selected)
    return translate(
      state.editing.selected.kind === 'cut'
        ? 'gallery.videoReview.cutLabel'
        : 'gallery.videoReview.speedMode'
    );
  return undefined;
}
