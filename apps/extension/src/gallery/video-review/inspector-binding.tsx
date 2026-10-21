import {
  exportMediaHubBackup,
  createMediaHubBackupExportOptions,
} from '../../workflows/media-hub-backup';
import { ReviewCursorPathEditor, ReviewCursorPathSettings } from './cursor-path-editor';
import { ReviewAnnotationInspector } from './annotation-effects-inspector';
import { reviewSubtitleMainOffset } from '../../features/video/review/subtitle-export';
import { ReviewOriginalSpeechPanel } from './speech-panel';
import { ReviewTextDocumentPanel } from './text-panel';
import { computeQuickEditSceneSize } from '../../features/video/review/advanced/scene';
import {
  changeRecordedClicks,
  changeRecordedKeys,
  changeRecordedActionAudio,
  auditionRecordedActionAudio,
} from './action-presentation';
import { ReviewActionHistory } from './action-history';
import { openVideoEditorPage, openGalleryPage } from '../../platform/navigation/extension-pages';
import { ReviewIntervalMap } from './interval-timing';
import { evaluateQuickEditCameraAtTime } from '../../features/video/review/advanced/scene';
import {
  ReviewSelectedProperties,
  ReviewSelectedTextProperties,
  reviewSelectionLabel,
} from './selected-properties';
import type { ReviewAnnotation } from '../../features/video/review/types';
import { ReviewInspector } from './inspector';
import type { ReviewInspectorNavigation } from './inspector-navigation';
import { ReviewComposer } from './composer';
import { exportReviewReport } from './report-actions';
import { ReviewFragmentAction, ReviewInspectorActions } from './edit-actions';
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
  | 'annotationEffects'
  | 'selection'
  | 'text'
  | 'playbackRange'
  | 'advancedPending'
  | 'advancedFailed'
  | 'retryAdvanced'
  | 'setCursorFocusPath'
  | 'cursorFocusPath'
  | 'cursorFocusKeys'
  | 'selectCursorFocusKey'
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
  | 'setActionAudio'
  | 'performAction'
  | 'actionSoundPreview'
  | 'setClickAnimations'
  | 'setBackground'
  | 'previewBackground'
  | 'setCanvas'
  | 'setCaptions'
  | 'setWindowHeader'
  | 'setOverlaysVisible'
  | 'resetAdvanced'
  | 'setCameraFollowDefaults'
  | 'flushAdvanced'
  | 'registerSpeechFlush'
  | 'setVoiceoverSilent'
>;

/** Adapts the retained playback range to the existing guarded fragment download. */
function ReviewInspectorFragment({ state }: { state: InspectorState }) {
  const selectedRange = state.selection.kind === 'range' ? state.selection : undefined;
  const selection = state.playbackRange
    ? { kind: 'range' as const, ...state.playbackRange }
    : selectedRange;
  if (!selection) return null;
  const exporter = state.editing.exporter;
  return (
    <ReviewFragmentAction
      showLabel
      selection={selection}
      edits={state.snapshot.document.edits}
      index={exporter.index}
      snapToKeyframes={state.advanced.ui.mode !== 'advanced'}
      busy={
        state.busy ||
        !!state.composer.before ||
        exporter.checkingCodecs ||
        exporter.phase !== 'idle' ||
        exporter.plan(selection).kind === 'unavailable'
      }
      onDownload={exporter.downloadSelection}
    />
  );
}

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
  recording,
}: {
  recording?: ReactNode;
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
  const { editing, snapshot, composer, busy, run } = state;
  const [historySelection, setHistorySelection] = useState<typeof state.activeSelection>();
  const leave = (done: () => void) => leaveReviewInspector(state, canvasComments, done);
  return (
    <ReviewIntervalMap.Provider value={state.timeline.timeMap.getSegments()}>
      <ReviewInspector
        recording={recording}
        textDocument={reviewInspectorTextDocument(state, canvasComments)}
        speech={
          <ReviewSourceSpeechBinding
            resource={resource}
            state={state}
            audio={audio}
            canvasComments={canvasComments}
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
            fragmentAction={<ReviewInspectorFragment state={state} />}
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
        selectionHasSections={hasSelectionSections(state)}
        scene={
          <ReviewScenePropertiesBinding
            file={resource.file}
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
        message={snapshot.error ? reviewErrorMessage(snapshot.error) : state.message}
        onBack={() => leave(onBack)}
        onClose={() => leave(onClose)}
        rangeSelected={!!state.playbackRange}
        onAdd={state.add}
        onSelect={state.selectComment}
        onHover={state.setHovered}
        onBackup={() => void run(() => backupReview(state, canvasComments))}
        onOpenVideoEditor={() =>
          void run(async () => {
            await flushReviewTextVoiceBuffers(state, canvasComments);
            const saved = await state.session.saveBuffered();
            await openVideoEditorPage(null, null, {
              aggregateId: saved.workspace.aggregateId,
              revision: saved.workspace.revision,
              createdAt: saved.workspace.createdAt,
              sourceAssetId: saved.workspace.sourceAssetId,
            });
          })
        }
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

/** Joins the text document to the existing voice buffers and canonical final-video clock. */
function reviewInspectorTextDocument(
  state: Pick<
    InspectorState,
    | 'text'
    | 'busy'
    | 'composer'
    | 'flushAdvanced'
    | 'session'
    | 'video'
    | 'registerSpeechFlush'
    | 'beforeAction'
    | 'setVoiceoverSilent'
    | 'editing'
  >,
  canvasComments: Pick<ReturnType<typeof useCanvasComments>, 'flushTexts'>
) {
  return (
    <ReviewTextDocumentPanel
      editor={state.text}
      snapshots={state.text.snapshots}
      busy={state.busy || state.editing.exporter.phase !== 'idle'}
      voice={reviewTextVoiceAccess(state, canvasComments)}
      subtitleMainOffset={reviewSubtitleMainOffset(
        state.editing.exporter.presentationDuration,
        state.editing.exporter.hasBookends
      )}
    />
  );
}

/** Original speech controls bind to the existing audio and timeline authorities. */
function ReviewSourceSpeechBinding({
  resource,
  state,
  audio,
  canvasComments,
}: {
  resource: LoadedReview;
  state: InspectorState;
  audio: ReturnType<typeof useReviewAudio>;
  canvasComments: ReturnType<typeof useCanvasComments>;
}) {
  return (
    <ReviewOriginalSpeechPanel
      key="original"
      mainVideo={state.video.current ?? undefined}
      resultTime={state.timeline.sceneOutputTime}
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
      beforeAction={state.beforeAction}
      flushAdvanced={() => flushReviewTextVoiceBuffers(state, canvasComments)}
      registerSpeechFlush={state.registerSpeechFlush}
      sourceAudioAvailable={!!state.editing.exporter.index?.audioCodec}
      {...(state.advanced.ui.mode === 'basic'
        ? { onEnableAdvanced: () => state.setMode('advanced') }
        : {})}
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
      captureCapabilities={state.projected.captureCapabilities}
      markers={state.projected.markers}
      activeRef={state.activeSelection.kind === 'telemetry' ? state.activeSelection.ref : undefined}
      keyAnimations={state.advanced.keyAnimations ?? []}
      actionAudio={state.advanced.actionAudio ?? []}
      onAudioChange={(targets, patch) => {
        void changeRecordedActionAudio(state, targets, patch);
      }}
      onAudition={(target, style) => auditionRecordedActionAudio(state, target, style)}
      onStopAudition={state.actionSoundPreview.stopAudition}
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

/** Backup joins accepted edits and recovery before reading the exact saved snapshot. */
async function backupReview(
  state: Pick<InspectorState, 'composer' | 'flushAdvanced' | 'session' | 'setMessage'>,
  canvasComments: Pick<ReturnType<typeof useCanvasComments>, 'flushTexts'>
) {
  await flushReviewTextVoiceBuffers(state, canvasComments);
  const expectedReview = await state.session.saveBuffered();
  try {
    await exportMediaHubBackup(
      createMediaHubBackupExportOptions({
        includeDrafts: true,
        scope: 'selected',
        selected: {
          mediaAssetIds: [expectedReview.workspace.aggregateId],
          scenarioProjectIds: [],
          videoProjectIds: [],
        },
      }),
      { expectedReview, requireSelected: true }
    );
  } catch (error) {
    if (!(error instanceof DOMException && error.name === 'AbortError'))
      state.setMessage(translate('gallery.videoReview.backupFailed'));
  }
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
  void state.setTrackVisibility('zoom', true);
  state.video.current?.pause();
  const time = state.timeline.timeMap.timelineToSource((region.start + region.end) / 2);
  if (time !== null) state.seek(time, false);
}

/** Scene controls share busy admission and the existing scene/audio writers. */
function ReviewScenePropertiesBinding({
  file,
  state,
  source,
  audio,
  onJoinPreview,
}: {
  file: File;
  onJoinPreview?: ((slot: 'intro' | 'outro', target?: 'fade' | 'join') => void) | undefined;
  state: InspectorState;
  source: LoadedReview['source'];
  audio: ReturnType<typeof useReviewAudio>;
}) {
  const { busy, editing } = state;
  return (
    <ReviewSceneProperties
      cropPreview={{ file, time: state.time }}
      cursorPath={
        <ReviewCursorPathSettings
          path={state.cursorFocusPath}
          cameraFollowDefaults={state.advanced.cameraFollowDefaults}
          onPolicyChange={state.setCameraFollowDefaults}
          disabled={busy || state.playing || editing.exporter.phase !== 'idle'}
          onChange={state.setCursorFocusPath}
        />
      }
      focus={{ advanced: state.advanced, time: state.timeline.sceneOutputTime }}
      background={state.advanced.background}
      canvas={state.advanced.canvas}
      captions={state.advanced.captions}
      onCaptions={state.setCaptions}
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
  if (state.activeSelection.kind === 'cursor-focus')
    return (
      <ReviewCursorPathEditor
        path={state.cursorFocusPath}
        time={state.time}
        duration={resource.source.duration}
        onSelect={state.selectCursorFocusKey}
        selectedKeyId={state.activeSelection.id}
        recordedKey={state.cursorFocusKeys.find(
          (key) =>
            state.activeSelection.kind === 'cursor-focus' && key.id === state.activeSelection.id
        )}
        disabled={state.busy || state.playing || state.editing.exporter.phase !== 'idle'}
        onChange={state.setCursorFocusPath}
      />
    );
  if (state.activeSelection.kind === 'annotation-effect') {
    const selection = state.activeSelection;
    const instance = state.annotationEffects.lane?.instances.find(
      (item) => item.id === selection.id
    );
    const snapshot = state.snapshot.snapshot.workspace.effectSnapshots?.find(
      (item) => item.id === instance?.snapshotId
    );
    return (
      <ReviewAnnotationInspector
        key={`${state.snapshot.snapshot.workspace.sourceAssetId}:${state.activeSelection.id}`}
        editor={state.annotationEffects}
        id={state.activeSelection.id}
        source={snapshot?.source}
        duration={resource.source.duration}
        busy={state.busy || state.editing.exporter.phase !== 'idle'}
      />
    );
  }
  if (state.activeSelection.kind === 'text')
    return (
      <ReviewSelectedTextProperties
        key={state.activeSelection.id}
        editor={state.text}
        id={state.activeSelection.id}
        busy={state.busy || state.editing.exporter.phase !== 'idle'}
        voice={reviewTextVoiceAccess(state, canvasComments)}
      />
    );
  return (
    <ReviewSelectedProperties
      registerSpeechFlush={state.registerSpeechFlush}
      beforeSpeechAction={state.beforeAction}
      flushAdvanced={() => flushReviewTextVoiceBuffers(state, canvasComments)}
      onSelectText={(id) =>
        state.beforeAction(() => {
          const fragment = state.text.document.fragments.find((entry) => entry.id === id);
          if (!fragment) return;
          state.video.current?.pause();
          state.seek(state.text.sourceInterval(fragment).start, false);
          state.setActiveSelection({ kind: 'text', id });
        })
      }
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
      onActionAudio={(targets, patch) => {
        void changeRecordedActionAudio(state, targets, patch);
      }}
      onActionAudioAudition={(target, style) => auditionRecordedActionAudio(state, target, style)}
      onStopActionAudioAudition={state.actionSoundPreview.stopAudition}
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
                state.timeline.sceneOutputTime,
                {
                  source: resource.source,
                  canvas: state.features.canvas,
                  background: state.features.background,
                  windowHeader: state.features.windowHeader,
                }
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

/** Leaving waits for the existing independent edit buffers before dismissing the inspector. */
function leaveReviewInspector(
  state: Pick<InspectorState, 'video' | 'run' | 'composer' | 'flushAdvanced' | 'session'>,
  canvasComments: Pick<ReturnType<typeof useCanvasComments>, 'flushTexts'>,
  done: () => void
) {
  state.video.current?.pause();
  void state.run(async () => {
    await flushReviewTextVoiceBuffers(state, canvasComments);
    await state.session.flush();
    done();
  });
}

/** Notes, advanced content and canvas text join the same ordered buffer before explicit API Save. */
function reviewTextVoiceAccess(
  state: Pick<
    InspectorState,
    | 'composer'
    | 'flushAdvanced'
    | 'session'
    | 'video'
    | 'registerSpeechFlush'
    | 'beforeAction'
    | 'setVoiceoverSilent'
    | 'editing'
  >,
  canvasComments: Pick<ReturnType<typeof useCanvasComments>, 'flushTexts'>
) {
  return {
    session: state.session,
    sourceAudioAvailable: () => !!state.editing.exporter.index?.audioCodec,
    beforeRequest: () => flushReviewTextVoiceBuffers(state, canvasComments),
    context: {
      video: state.video,
      registerPending: state.registerSpeechFlush,
      beforeAction: state.beforeAction,
      setSilent: state.setVoiceoverSilent,
    },
  };
}

/** All-buffer joins are shared by explicit voice actions and leaving the inspector. */
async function flushReviewTextVoiceBuffers(
  state: Pick<InspectorState, 'composer' | 'flushAdvanced'>,
  canvasComments: Pick<ReturnType<typeof useCanvasComments>, 'flushTexts'>
) {
  await state.composer.flush();
  await state.flushAdvanced();
  await canvasComments.flushTexts();
}

function hasSelectionSections(state: InspectorState): boolean {
  return (
    state.activeSelection.kind === 'cursor-focus' ||
    state.activeSelection.kind === 'original-audio' ||
    state.activeSelection.kind === 'telemetry' ||
    (state.advanced.ui.mode === 'advanced' &&
      [
        'zoom',
        'canvas-comment',
        'audio',
        'webcam',
        'webcam-position',
        'annotation-effect',
      ].includes(state.activeSelection.kind))
  );
}
