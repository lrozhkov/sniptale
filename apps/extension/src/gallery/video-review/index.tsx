import { reviewOriginalAudioFeedbackMessage } from './original-audio-feedback';
import { ReviewDialog } from './review-dialog';
import { ReviewHistoryControls } from './timeline-chrome';
import { ReviewSelectedProperties } from './selected-properties';
import { useState } from 'react';
import { translate, useAppLocale } from '../../platform/i18n';
import type { ReviewAnnotation } from '../../features/video/review/types';
import { ReviewButton, reviewEventLabel } from './controls';
import { useReviewWaveforms } from './audio-waveform';
import { ReviewStageBinding } from './stage-binding';
import { ReviewTimelineBinding } from './timeline-binding';
import { ReviewInspector } from './inspector';
import {
  useReviewInspectorNavigation,
  type ReviewInspectorNavigation,
} from './inspector-navigation';
import { ReviewComposer } from './composer';
import { useLoadedReview, type LoadedReview } from './use-session';
import { exportReviewReport } from './report-actions';
import { ReviewRenderOptions, ReviewEditActions } from './edit-actions';
import { ReviewSceneProperties } from './advanced-panels';
import type { useCanvasComments } from './use-canvas-comments';
import type { useReviewAudio } from './use-review-audio';
import { useReviewEditorAudio } from './voiceover-recording';
import { ReviewVoiceoverLayer } from './voiceover-panel';
import { useReviewEditorState } from './use-editor-state';

type InspectorState = Pick<
  ReturnType<typeof useReviewEditorState>,
  | 'selection'
  | 'advancedPending'
  | 'advancedFailed'
  | 'retryAdvanced'
  | 'setMode'
  | 'setTrackVisibility'
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
  | 'beforeAction'
  | 'leaveNewNote'
  | 'runComposer'
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
  const exportPlan = editing.exporter.plan();
  const checkingCodecs = editing.exporter.checkingCodecs;
  const settings =
    snapshot.snapshot.workspace.advanced.ui.mode === 'advanced' ? (
      <ReviewRenderOptions
        exporter={editing.exporter}
        busy={busy || composerBusy || checkingCodecs || editing.exporter.phase !== 'idle'}
      />
    ) : null;
  return (
    <>
      <ReviewEditActions
        settings={settings}
        available={!!editing.exporter.index && editing.exporter.index.boundaries.length >= 2}
        hasEdits={snapshot.document.edits.length > 0}
        busy={busy || composerBusy || checkingCodecs}
        phase={editing.exporter.phase}
        progress={editing.exporter.progress}
        failed={editing.exporter.failed}
        hasResult={!!editing.exporter.result}
        advancedBlockers={
          checkingCodecs
            ? null
            : exportPlan.kind === 'unavailable'
              ? exportPlan.reasons
              : editing.exporter.blocked
        }
        onExport={onExport}
        onCancel={editing.exporter.cancel}
        onDownload={editing.exporter.download}
      />
    </>
  );
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
  onClose,
  fullHeight,
  onToggleHeight,
  navigation,
}: {
  fullHeight: boolean;
  navigation: ReviewInspectorNavigation;
  onToggleHeight(): void;
  resource: LoadedReview;
  state: InspectorState;
  canvasComments: ReturnType<typeof useCanvasComments>;
  audio: ReturnType<typeof useReviewAudio>;
  onBack(): void;
  onClose(): void;
}) {
  const { editing, session, snapshot, composer, video, busy, run } = state;
  const leave = (done: () => void) => {
    video.current?.pause();
    void run(async () => {
      await composer.flush();
      await state.flushAdvanced();
      await canvasComments.flushTexts();
      await session.flush();
      done();
    });
  };
  return (
    <ReviewInspector
      beforeAction={state.beforeAction}
      fullHeight={fullHeight}
      navigation={navigation}
      onToggleHeight={onToggleHeight}
      filename={resource.filename}
      annotations={snapshot.document.annotations}
      selectedId={state.selected?.id ?? null}
      busy={busy || editing.exporter.phase !== 'idle'}
      actions={
        <ReviewInspectorActions
          editing={editing}
          snapshot={snapshot}
          busy={busy}
          composerBusy={!!composer.before}
          onExport={() => {
            video.current?.pause();
            void editing.exporter.start();
          }}
        />
      }
      settingsAvailable={state.advanced.ui.mode === 'advanced'}
      editingId={composer.annotation?.id}
      composer={
        composer.annotation ? (
          <ReviewCommentComposer state={state} annotation={composer.annotation} />
        ) : null
      }
      selectionLabel={reviewSelectionLabel(state)}
      selectionPreferenceScope={state.activeSelection.kind}
      selectionHasSections={
        state.advanced.ui.mode === 'advanced' &&
        (state.activeSelection.kind === 'zoom' ||
          state.activeSelection.kind === 'canvas-comment' ||
          state.activeSelection.kind === 'audio' ||
          state.activeSelection.kind === 'original-audio')
      }
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
          onImportImage={(file) =>
            state.beforeAction(() => void state.backgroundImport.importImage(file))
          }
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
      message={
        snapshot.error
          ? reviewErrorMessage(snapshot.error)
          : (state.message ?? reviewOriginalAudioFeedbackMessage(audio.originalFeedback))
      }
      onBack={() => leave(onBack)}
      onClose={() => leave(onClose)}
      rangeSelected={state.selection.kind === 'range'}
      onAdd={state.add}
      onSelect={state.selectComment}
      onHover={state.setHovered}
      {...reviewInspectorNoteActions(state, resource)}
    >
      <ReviewSelectedProperties
        advanced={state.advanced}
        selection={state.activeSelection}
        editing={state.editing}
        zoom={state.zoom}
        busy={state.busy}
        markers={state.projected.markers}
        onFocus={(region) => focusRecordedAction(state, region)}
        onPreviewFrame={(time) => {
          video.current?.pause();
          state.seek(time, false);
        }}
        toSourceTime={state.timeline.timeMap.timelineToSource}
        resource={resource}
        audio={audio}
        canvasComments={canvasComments}
      />
    </ReviewInspector>
  );
}

/** Note mutations and report feedback share the existing editor action/session authority. */
function reviewInspectorNoteActions(
  state: InspectorState,
  resource: LoadedReview
): Pick<Parameters<typeof ReviewInspector>[0], 'onEdit' | 'onDelete' | 'onReport'> {
  const { busy, composer, editing, run, session } = state;
  return {
    onEdit: (annotation) =>
      state.beforeAction(() => {
        if (state.canStart()) {
          state.selectComment(annotation);
          composer.change(annotation, annotation);
        }
      }),
    onDelete: (annotation) => {
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
    },
    onReport: (action) =>
      state.beforeAction(() => {
        if (busy) return;
        state.setBusy(true);
        state.setMessage(null);
        void exportReviewReport(resource, action, editing.exporter.result?.receipt)
          .catch(() => state.setMessage(translate('gallery.videoReview.reportFailed')))
          .finally(() => state.setBusy(false));
      }),
  };
}

function ReviewCommentComposer({
  state,
  annotation,
}: {
  state: Pick<
    InspectorState,
    'composer' | 'busy' | 'runComposer' | 'leaveNewNote' | 'selectComment'
  >;
  annotation: ReviewAnnotation;
}) {
  const { composer, busy, runComposer: run } = state;
  return (
    <ReviewComposer
      key={annotation.id}
      annotation={annotation}
      busy={busy || composer.finishing}
      onLeave={state.leaveNewNote}
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
    onOpenChange: state.setVoiceoverSilent,
    run: state.run,
    flushAdvanced: state.flushAdvanced,
    audio: state.audio,
    session: state.session,
  });
  return { onImportAudioFile, voiceover };
}

function ReviewHistoryControlBinding({
  state,
}: {
  state: ReturnType<typeof useReviewEditorState>;
}) {
  const { busy, composer, editing, snapshot } = state;
  return (
    <ReviewHistoryControls
      busy={busy || !!composer.before || editing.exporter.phase !== 'idle'}
      cursor={snapshot.snapshot.workspace.cursor}
      length={snapshot.snapshot.workspace.history.length}
      onHistory={state.moveHistory}
      onAddNote={() => state.add()}
      autosave={{
        enabled: snapshot.autosaveEnabled,
        error: snapshot.error,
        errorMessage: snapshot.error ? reviewErrorMessage(snapshot.error) : null,
        dirty: snapshot.dirty,
        saving: snapshot.pending > 0,
        busy,
        onChange: (enabled) => state.beforeAction(() => state.session.setAutosaveEnabled(enabled)),
        onReload: () =>
          state.runComposer(async () => {
            await state.composer.reload();
            state.resetAdvanced();
          }),
      }}
    />
  );
}

function ReviewEditor({
  resource,
  onBack,
  onClose,
}: {
  resource: LoadedReview;
  onBack(): void;
  onClose(): void;
}) {
  const state = useReviewEditorState(resource);
  const [fullHeight, setFullHeight] = useState(false);
  const [exportRequest, requestExport] = useState(0);
  const navigation = useReviewInspectorNavigation({
    beforeAction: state.beforeAction,
    contextKey: reviewInspectorContext(state),
    contextSelection: state.activeSelection,
    selectionLabel: reviewSelectionLabel(state),
    settingsAvailable: state.advanced.ui.mode === 'advanced',
    exportAvailable: true,
    exportRequest,
  });
  const { onImportAudioFile, voiceover } = useReviewAudioWiring(state);
  const { audio, canvasComments, editing, snapshot, composer, advanced, features, zoom, busy } =
    state;
  const waveforms = useReviewWaveforms(
    resource.file,
    state.source.duration,
    { voiceover: features.voiceover, music: features.music },
    features.mode === 'advanced',
    editing.exporter.index === null || !!editing.exporter.index.audioCodec
  );
  return (
    <>
      <div
        inert={voiceover.recording}
        className={`grid h-full min-h-0 grid-cols-[minmax(0,1fr)_320px] grid-rows-[minmax(0,1fr)_auto]
          max-[799px]:grid-cols-1
          max-[799px]:grid-rows-[minmax(280px,45dvh)_minmax(360px,1fr)_auto]
          max-[799px]:overflow-y-auto ${voiceover.recording ? 'pb-40' : ''}`}
      >
        <main className="flex min-h-0 min-w-0 flex-col overflow-hidden p-3">
          <ReviewStageBinding
            cutPreview={{
              file: resource.file,
              duration: state.source.duration,
              edits: snapshot.document.edits,
              time: state.timeline.sceneOutputTime,
            }}
            backgroundPending={state.backgroundImport.pending}
            url={resource.url}
            source={state.source}
            canvas={features.canvas}
            video={state.video}
            drawing={!!composer.annotation && !state.playing && !busy}
            region={state.displayRegion}
            zoomRegions={features.zoomRegions}
            background={features.background}
            outputTime={state.timeline.sceneOutputTime}
            zoomOverlay={reviewFocusOverlay(state)}
            comments={snapshot.document.canvasComments}
            annotations={snapshot.document.annotations}
            canvasComments={canvasComments}
            overlaysVisible={features.overlaysVisible}
            time={state.time}
            busy={busy}
            onRegion={(region) => {
              if (composer.annotation && !busy) composer.change({ ...composer.annotation, region });
            }}
            onReady={() => {
              const anchor = composer.annotation?.anchor;
              if (anchor) state.seek(anchor.kind === 'point' ? anchor.time : anchor.start);
            }}
            onTime={(value) => {
              const next = state.onTime(value);
              state.setSelection((current) =>
                current.kind === 'point' ? { kind: 'point', time: next } : current
              );
            }}
            onPlaying={state.setPlaying}
            onError={() => state.setMessage(translate('gallery.videoReview.playbackFailed'))}
          />
        </main>
        <ReviewInspectorBinding
          navigation={navigation}
          fullHeight={fullHeight}
          onToggleHeight={() => setFullHeight((value) => !value)}
          resource={resource}
          state={state}
          canvasComments={canvasComments}
          audio={audio}
          onBack={onBack}
          onClose={onClose}
        />
        <div
          className={
            `${voiceover.recording ? 'opacity-50' : ''} ` +
            (fullHeight
              ? 'col-start-1 row-start-2 min-h-0 min-w-0 max-[799px]:row-start-3'
              : 'col-span-full min-h-0 min-w-0')
          }
        >
          <ReviewTimelineBinding
            zoomAnchor={state.zoomAnchor}
            beforeAction={state.beforeAction}
            onOpenExport={() => requestExport((value) => value + 1)}
            exportActive={navigation.shown === 'export'}
            historyControls={<ReviewHistoryControlBinding state={state} />}
            editing={editing}
            edits={snapshot.document.edits}
            annotations={snapshot.document.annotations}
            source={state.source}
            busy={busy}
            composerBusy={!!composer.before}
            selection={state.selection}
            setSelection={state.setSelection}
            advanced={advanced}
            resultDuration={state.timeline.resultDuration}
            outputTime={state.timeline.outputTime}
            toOutputTime={state.timeline.toOutputTime}
            onCutPlacement={() => state.setMessage(translate('gallery.videoReview.placementOnCut'))}
            setTrackVisibility={state.setTrackVisibility}
            setMode={state.setMode}
            telemetryAvailable={state.projected.markers.length > 0}
            time={state.time}
            playing={state.playing}
            markers={state.telemetry ? state.projected.markers : []}
            selectedTelemetryRef={
              state.activeSelection.kind === 'telemetry' ? state.activeSelection.ref : undefined
            }
            zoom={zoom}
            audio={audio}
            audioState={advanced.audio}
            waveforms={waveforms}
            onImportAudioFile={(...args) => state.beforeAction(() => onImportAudioFile(...args))}
            onRecordVoiceover={() => state.beforeAction(voiceover.open)}
            onClearSelection={() => state.setActiveSelection({ kind: 'none' })}
            selectedObject={state.activeSelection.kind !== 'none'}
            onMarker={(marker) => {
              if (!state.canStart()) return;
              state.seek(marker.start, false);
              state.setActiveSelection({ kind: 'telemetry', ref: marker.ref });
            }}
            onComment={state.selectComment}
            onSeek={state.seek}
            onPlay={state.play}
          />
        </div>
      </div>
      <ReviewVoiceoverLayer
        voiceover={voiceover}
        outputTime={state.timeline.outputTime}
        resultDuration={state.timeline.resultDuration}
      />
    </>
  );
}

/** Native modal owns focus/inert; Escape cancels drawing, header navigation exits after recovery flush. */
export function VideoReview({
  aggregateId,
  onBack,
  onClose = onBack,
}: {
  aggregateId: string;
  onBack(): void;
  onClose?(): void;
}) {
  useAppLocale();
  const { resource, failed, retry } = useLoadedReview(aggregateId);
  return (
    <ReviewDialog>
      {resource ? (
        <ReviewEditor resource={resource} onBack={onBack} onClose={onClose} />
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
    </ReviewDialog>
  );
}

function reviewInspectorContext(state: InspectorState): string {
  if (state.composer.annotation) return `comments:${state.composer.annotation.id}`;
  const selection = state.activeSelection;
  if (selection.kind === 'annotation') return `comments:${selection.id}`;
  if (selection.kind === 'telemetry') return `action:${selection.ref.kind}:${selection.ref.id}`;
  if (selection.kind === 'edit') return `edit:${selection.id}`;
  if (state.advanced.ui.mode !== 'advanced') return 'comments';
  const id = 'id' in selection ? selection.id : '';
  return `settings:${selection.kind}:${id}`;
}

function reviewSelectionLabel(state: InspectorState): string | undefined {
  const selection = state.activeSelection;
  if (selection.kind === 'telemetry') {
    const marker = state.projected.markers.find(
      (item) => item.ref.kind === selection.ref.kind && item.ref.id === selection.ref.id
    );
    return reviewEventLabel(marker?.eventType ?? '');
  }
  if (selection.kind === 'zoom')
    return translate(
      state.advanced.zoom.regions.find((region) => region.id === selection.id)?.spotlight
        ? 'gallery.videoReview.focusSpotlight'
        : 'gallery.videoReview.zoomRegionLabel'
    );
  if (selection.kind === 'zoom-link') return translate('gallery.videoReview.zoomLinkSettings');
  if (selection.kind === 'canvas-comment') return translate('gallery.videoReview.overlayComments');
  if (selection.kind === 'original-audio')
    return translate('gallery.videoReview.originalAudioRange');
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

/** The selected focus shares one edit transaction between the inspector and the stage. */
function reviewFocusOverlay(state: ReturnType<typeof useReviewEditorState>) {
  const { zoom, features, advanced, busy, playing, editing } = state;
  const region = features.zoomTrackVisible ? zoom.selected(advanced.zoom) : null;
  if (!region || busy || playing || editing.exporter.phase !== 'idle') return undefined;
  return {
    region: zoom.previewRegion(region),
    onPreview: (patch: Parameters<typeof zoom.preview>[1]) => zoom.preview(region.id, patch),
    onChange: (patch: Parameters<typeof zoom.change>[1]) => zoom.change(region.id, patch),
    onInteract: () => {
      const time = state.timeline.timeMap.timelineToSource((region.start + region.end) / 2);
      if (time !== null) state.seek(time, false);
    },
  };
}

/** Creating a focus from history enables its workspace lane and shows the authored target frame. */
function focusRecordedAction(
  state: InspectorState,
  region: Parameters<InspectorState['zoom']['addRegion']>[0]
) {
  if (state.busy || state.editing.exporter.phase !== 'idle' || !state.canStart()) return;
  const id = state.zoom.addRegion(region);
  if (!id) return;
  if (state.advanced.ui.mode !== 'advanced') state.setMode('advanced');
  state.zoom.setSelection(id);
  state.setTrackVisibility('zoom', true);
  state.video.current?.pause();
  const time = state.timeline.timeMap.timelineToSource((region.start + region.end) / 2);
  if (time !== null) state.seek(time, false);
}
