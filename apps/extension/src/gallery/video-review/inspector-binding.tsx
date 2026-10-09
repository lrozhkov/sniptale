import { ReviewOriginalSpeechPanel } from './speech-panel';
import { computeQuickEditSceneSize } from '../../features/video/review/advanced/scene';
import { changeRecordedClicks, changeRecordedKeys } from './action-presentation';
import { ReviewActionHistory } from './action-history';
import { openGalleryPage } from '../../platform/navigation/extension-pages';
import { ReviewIntervalMap } from './interval-timing';
import { evaluateQuickEditCameraAtTime } from '../../features/video/review/advanced/scene';
import { ReviewSelectedProperties, reviewSelectionLabel } from './selected-properties';
import type { ReviewAnnotation } from '../../features/video/review/types';
import { ReviewInspector } from './inspector';
import type { ReviewInspectorNavigation } from './inspector-navigation';
import { ReviewComposer } from './composer';
import { exportReviewReport } from './report-actions';
import { ReviewInspectorActions } from './edit-actions';
import { ReviewSceneProperties } from './advanced-panels';
import type { useCanvasComments } from './use-canvas-comments';
import type { useReviewAudio } from './use-review-audio';
import { reviewErrorMessage } from './feedback';
import { useState, type ReactNode } from 'react';
import { translate } from '../../platform/i18n';
import type { LoadedReview } from './use-session';
import type { useReviewEditorState } from './use-editor-state';

type InspectorState = Pick<
  ReturnType<typeof useReviewEditorState>,
  | 'selection'
  | 'playbackRange'
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
  | 'playing'
  | 'features'
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
  | 'webcam'
  | 'watermark'
  | 'presentation'
  | 'timeline'
  | 'setKeyAnimations'
  | 'setClickAnimations'
  | 'setBackground'
  | 'previewBackground'
  | 'setCanvas'
  | 'setWindowHeader'
  | 'setOverlaysVisible'
  | 'resetAdvanced'
  | 'flushAdvanced'
  | 'registerSpeechFlush'
>;

export function ReviewInspectorBinding({
  resource,
  state,
  canvasComments,
  audio,
  onBack,
  onClose,
  fullHeight,
  onToggleHeight,
  navigation,
  resizeHandle,
  preview,
  onJoinPreview,
  selectedSpeechId,
}: {
  selectedSpeechId?: string | undefined;
  onJoinPreview?: ((slot: 'intro' | 'outro', target?: 'fade' | 'join') => void) | undefined;
  preview?: ReactNode;
  resizeHandle?: ReactNode;
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
  const [historySelection, setHistorySelection] = useState<typeof state.activeSelection>();
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
    <ReviewIntervalMap.Provider value={state.timeline.timeMap.getSegments()}>
      <ReviewInspector
        speech={
          <ReviewSourceSpeechBinding
            resource={resource}
            state={state}
            audio={audio}
            selectedSpeechId={selectedSpeechId}
          />
        }
        preview={preview}
        beforeAction={state.beforeAction}
        fullHeight={fullHeight}
        resizeHandle={resizeHandle}
        navigation={navigation}
        onToggleHeight={onToggleHeight}
        filename={resource.filename}
        annotations={snapshot.document.annotations}
        selectedId={state.selected?.id ?? null}
        busy={busy || editing.exporter.phase !== 'idle'}
        actions={
          <ReviewInspectorActions
            exporter={editing.exporter}
            toolKey={`${editing.mode}:${state.zoom.drawing}:${state.zoom.insertionType}:${audio.originalTool}`}
            onOpenResult={(mediaId) => {
              void run(() => openGalleryPage({ mediaId }));
            }}
            advanced={snapshot.snapshot.workspace.advanced.ui.mode === 'advanced'}
            hasEdits={snapshot.document.edits.length > 0}
            busy={busy}
            composerBusy={!!composer.before}
            onExport={() => {
              state.beforeAction(() => void editing.exporter.start());
            }}
          />
        }
        actionHistory={
          <ReviewRecordedHistory
            state={state}
            onSelection={(selection) => {
              setHistorySelection(selection);
              navigation.setSection('selected');
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
        selectionLabel={reviewSelectionLabel({
          selection: state.activeSelection,
          markers: state.projected.markers,
          advanced: state.advanced,
          editing: state.editing,
        })}
        selectionPreferenceScope={state.activeSelection.kind}
        selectionHasSections={
          state.activeSelection.kind === 'original-audio' ||
          state.activeSelection.kind === 'telemetry' ||
          (state.advanced.ui.mode === 'advanced' &&
            ['zoom', 'canvas-comment', 'audio', 'webcam', 'webcam-position'].includes(
              state.activeSelection.kind
            ))
        }
        scene={
          <ReviewScenePropertiesBinding
            state={state}
            source={resource.source}
            audio={audio}
            onJoinPreview={onJoinPreview}
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
        message={snapshot.error ? reviewErrorMessage(snapshot.error) : null}
        onBack={() => leave(onBack)}
        onClose={() => leave(onClose)}
        rangeSelected={state.selection.kind === 'range'}
        onAdd={state.add}
        onSelect={state.selectComment}
        onHover={state.setHovered}
        {...reviewInspectorNoteActions(state, resource)}
      >
        <ReviewSelectionBinding
          onBackToHistory={
            state.activeSelection === historySelection
              ? () => navigation.setSection('history')
              : undefined
          }
          state={state}
          resource={resource}
          audio={audio}
          canvasComments={canvasComments}
        />
      </ReviewInspector>
    </ReviewIntervalMap.Provider>
  );
}

/** Original speech controls bind to the existing audio and timeline authorities. */
function ReviewSourceSpeechBinding({
  resource,
  state,
  audio,
  selectedSpeechId,
}: {
  resource: LoadedReview;
  state: InspectorState;
  audio: ReturnType<typeof useReviewAudio>;
  selectedSpeechId: string | undefined;
}) {
  return (
    <ReviewOriginalSpeechPanel
      key="original"
      mainVideo={state.video.current ?? undefined}
      resultTime={state.timeline.sceneOutputTime}
      assetNames={audio.assets}
      masterAudio={state.advanced.audio.original}
      masterDisabled={state.busy}
      onMasterVolumeChange={(volume) => audio.setOriginal({ volume })}
      onJump={(time) => {
        state.video.current?.pause();
        state.seek(time, false);
      }}
      session={resource.session}
      original={{
        file: resource.file,
        sourceAssetId: state.snapshot.snapshot.workspace.sourceAssetId,
      }}
      selection={
        state.playbackRange ?? (state.selection.kind === 'range' ? state.selection : undefined)
      }
      selectedReplacementId={selectedSpeechId}
      beforeAction={state.beforeAction}
      flushAdvanced={state.flushAdvanced}
      registerSpeechFlush={state.registerSpeechFlush}
      sourceAudioAvailable={!!state.editing.exporter.index?.audioCodec}
      originalSpeechEnabled={state.advanced.audio.originalSpeech?.enabled ?? true}
      onToggleOriginalSpeech={audio.setOriginalSpeechEnabled}
    />
  );
}

/** Recorded action navigation and animation edits share the state action guard. */
function ReviewRecordedHistory({
  state,
  onSelection,
}: {
  state: InspectorState;
  onSelection(selection: InspectorState['activeSelection']): void;
}) {
  return (
    <ReviewActionHistory
      markers={state.projected.markers}
      activeRef={state.activeSelection.kind === 'telemetry' ? state.activeSelection.ref : undefined}
      keyAnimations={state.advanced.keyAnimations ?? []}
      onKeyChange={(ids, patch) => changeRecordedKeys(state, ids, patch)}
      animations={state.advanced.clickAnimations ?? []}
      busy={state.busy || state.editing.exporter.phase !== 'idle'}
      onChange={(ids, patch) => changeRecordedClicks(state, ids, patch)}
      onSelect={(marker) =>
        state.beforeAction(() => {
          state.video.current?.pause();
          state.seek(marker.start, false);
          const selection = { kind: 'telemetry' as const, ref: marker.ref };
          state.setActiveSelection(selection);
          onSelection(selection);
        })
      }
    />
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

export function reviewInspectorContext(state: InspectorState): string {
  if (state.composer.annotation) return `comments:${state.composer.annotation.id}`;
  const selection = state.activeSelection;
  if (selection.kind === 'annotation') return `comments:${selection.id}`;
  if (selection.kind === 'telemetry') return `action:${selection.ref.kind}:${selection.ref.id}`;
  if (selection.kind === 'edit') return `edit:${selection.id}`;
  if (selection.kind === 'original-audio') return `settings:original-audio:${selection.id}`;
  if (state.advanced.ui.mode !== 'advanced') return 'comments';
  const id = 'id' in selection ? selection.id : '';
  return `settings:${selection.kind}:${id}`;
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

/** Scene controls share busy admission and the existing scene/audio writers. */
function ReviewScenePropertiesBinding({
  state,
  source,
  audio,
  onJoinPreview,
}: {
  onJoinPreview?: ((slot: 'intro' | 'outro', target?: 'fade' | 'join') => void) | undefined;
  state: InspectorState;
  source: LoadedReview['source'];
  audio: ReturnType<typeof useReviewAudio>;
}) {
  const { busy, editing } = state;
  return (
    <ReviewSceneProperties
      focus={{ advanced: state.advanced, time: state.timeline.sceneOutputTime }}
      background={state.advanced.background}
      canvas={state.advanced.canvas}
      source={source}
      onCanvas={state.setCanvas}
      presentation={{
        editor: state.presentation,
        mainDuration: state.timeline.resultDuration,
        onJoinPreview,
        output: computeQuickEditSceneSize({
          source,
          background: state.features.background,
          canvas: state.features.canvas,
          windowHeader: state.features.windowHeader,
        }),
      }}
      watermark={{
        settings: state.advanced.watermark,
        output: computeQuickEditSceneSize({
          source,
          background: state.features.background,
          canvas: state.features.canvas,
          windowHeader: state.features.windowHeader,
        }),
        onChange: state.watermark.change,
        onPreview: state.watermark.preview,
        onImage: state.watermark.image,
        onError: state.watermark.setError,
        pending: state.watermark.pending,
        error: state.watermark.error,
        onRetry: state.watermark.retry,
        imagePreviewUrl: state.watermark.imagePreviewUrl,
      }}
      windowHeader={state.advanced.windowHeader}
      onWindowHeader={state.setWindowHeader}
      audio={state.advanced.audio}
      hasOriginalAudio={editing.exporter.index === null || !!editing.exporter.index.audioCodec}
      onOriginalVolume={(volume) => audio.setOriginal({ volume })}
      onLaneVolume={audio.setLaneVolume}
      busy={busy || editing.exporter.phase !== 'idle'}
      pending={state.backgroundImport.pending}
      failed={state.backgroundImport.failed}
      onImportImage={(file, originMediaId) =>
        state.beforeAction(() => void state.backgroundImport.importImage(file, originMediaId))
      }
      setBackground={state.setBackground}
      onPreviewBackground={state.previewBackground}
    />
  );
}

/** Wires selected-object controls to the existing state writers and preview clock. */
function ReviewSelectionBinding({
  onBackToHistory,
  state,
  resource,
  audio,
  canvasComments,
}: {
  state: InspectorState;
  resource: LoadedReview;
  audio: ReturnType<typeof useReviewAudio>;
  canvasComments: ReturnType<typeof useCanvasComments>;
  onBackToHistory?: (() => void) | undefined;
}) {
  const video = state.video;
  return (
    <ReviewSelectedProperties
      registerSpeechFlush={state.registerSpeechFlush}
      beforeSpeechAction={state.beforeAction}
      flushAdvanced={state.flushAdvanced}
      webcam={state.webcam}
      webcamRange={
        state.playbackRange ?? (state.selection.kind === 'range' ? state.selection : undefined)
      }
      advanced={state.advanced}
      selection={state.activeSelection}
      editing={state.editing}
      zoom={state.zoom}
      busy={state.busy}
      onKeyAnimation={(ids, patch) => changeRecordedKeys(state, ids, patch)}
      onClickAnimation={(ids, patch) => changeRecordedClicks(state, ids, patch)}
      {...(onBackToHistory ? { onOpenHistory: onBackToHistory } : {})}
      markers={state.projected.markers}
      onFocus={(region) => focusRecordedAction(state, region)}
      onPreviewFrame={(time) => {
        video.current?.pause();
        state.seek(time, false);
      }}
      mainVideo={video.current ?? undefined}
      focusTime={state.timeline.sceneOutputTime}
      playback={
        state.playing && video.current
          ? {
              video: video.current,
              camera: evaluateQuickEditCameraAtTime(
                state.features.zoomRegions,
                state.timeline.sceneOutputTime
              ),
            }
          : undefined
      }
      toSourceTime={state.timeline.timeMap.timelineToSource}
      resource={resource}
      audio={audio}
      canvasComments={canvasComments}
    />
  );
}
