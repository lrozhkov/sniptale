import { ReviewActionHistory } from './action-history';
import {
  patchReviewClicks,
  type ReviewClickStyle,
} from '../../features/video/review/advanced/click-animation';
import { openGalleryPage } from '../../platform/navigation/extension-pages';
import { ReviewPanelResizeHandle, useReviewPanelLayout } from './panel-layout';
import { ReviewPreviewFrame } from './preview-frame';
import { reviewStagePickRegions } from './stage-focus';
import { ReviewIntervalMap } from './interval-timing';
import { evaluateQuickEditCameraAtTime } from '../../features/video/review/advanced/scene';
import { ReviewFeedback, ReviewLoadStatus, reviewErrorMessage } from './feedback';
import { ReviewDialog } from './review-dialog';
import { ReviewHistoryControls } from './timeline-chrome';
import { ReviewSelectedProperties, reviewSelectionLabel } from './selected-properties';
import { useState, type ReactNode } from 'react';
import { translate, useAppLocale } from '../../platform/i18n';
import type { ReviewAnnotation } from '../../features/video/review/types';
import { ReviewButton } from './controls';
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
import { ReviewInspectorActions } from './edit-actions';
import { ReviewSceneProperties } from './advanced-panels';
import type { useCanvasComments } from './use-canvas-comments';
import type { useReviewAudio } from './use-review-audio';
import { useReviewAudioWiring } from './voiceover-recording';
import { ReviewVoiceoverLayer } from './voiceover-panel';
import { useReviewEditorState } from './use-editor-state';

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
  | 'timeline'
  | 'setClickAnimations'
  | 'setBackground'
  | 'setCanvas'
  | 'setWindowHeader'
  | 'setOverlaysVisible'
  | 'resetAdvanced'
  | 'flushAdvanced'
>;

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
  resizeHandle,
}: {
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
              void editing.exporter.start();
            }}
          />
        }
        actionHistory={
          <ReviewActionHistory
            markers={state.projected.markers}
            animations={state.advanced.clickAnimations ?? []}
            busy={busy || editing.exporter.phase !== 'idle'}
            onChange={(ids, patch) => changeRecordedClicks(state, ids, patch)}
            onSelect={(marker) =>
              state.beforeAction(() => {
                video.current?.pause();
                state.seek(marker.start, false);
                const selection = { kind: 'telemetry' as const, ref: marker.ref };
                setHistorySelection(selection);
                state.setActiveSelection(selection);
                navigation.setSection('selected');
              })
            }
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
          (state.advanced.ui.mode === 'advanced' &&
            (state.activeSelection.kind === 'zoom' ||
              state.activeSelection.kind === 'canvas-comment' ||
              state.activeSelection.kind === 'audio' ||
              state.activeSelection.kind === 'webcam' ||
              state.activeSelection.kind === 'webcam-position'))
        }
        scene={
          <ReviewScenePropertiesBinding state={state} source={resource.source} audio={audio} />
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

/** Preview layout, feedback and stage events share one visible-area binding. */
function ReviewPreviewBinding({
  resource,
  state,
}: {
  resource: LoadedReview;
  state: ReturnType<typeof useReviewEditorState>;
}) {
  const { busy, features, composer, snapshot, canvasComments, audio } = state;
  return (
    <main className="flex min-h-0 min-w-0 flex-col overflow-hidden p-3">
      {state.webcam.failed || state.webcam.pending ? (
        <div
          role={state.webcam.failed ? 'alert' : 'status'}
          className="flex items-center gap-2 text-xs"
        >
          <span>
            {translate(
              state.webcam.failed
                ? 'gallery.videoReview.webcamFailed'
                : 'gallery.videoReview.webcamLoading'
            )}
          </span>
          {state.webcam.failed ? (
            <ReviewButton
              label={translate('gallery.videoReview.retry')}
              onClick={state.webcam.retry}
            />
          ) : null}
        </div>
      ) : null}
      <ReviewFeedback
        message={state.message}
        originalFeedback={audio.originalFeedback}
        onDismiss={() => {
          state.setMessage(null);
          audio.dismissOriginalFeedback();
        }}
      />
      <ReviewPreviewFrame
        time={state.timeline.sceneOutputTime}
        duration={state.timeline.resultDuration}
        playing={state.playing}
        disabled={busy || state.editing.exporter.phase !== 'idle'}
        onPlay={() => state.beforeAction(state.play)}
        onSeek={(value) =>
          state.beforeAction(() => {
            const sourceTime = state.timeline.timeMap.timelineToSource(value);
            if (sourceTime !== null) {
              state.setActiveSelection({ kind: 'none' });
              state.seek(sourceTime, false);
            }
          })
        }
      >
        {(fullscreen) => (
          <ReviewStageBinding
            clickCues={state.clickCues}
            webcam={
              features.webcam && !state.webcam.pending
                ? {
                    settings: features.webcam,
                    editor: state.webcam,
                    onResourceReady: state.exporter.retryAssetAvailability,
                    disabled:
                      state.playing ||
                      busy ||
                      state.editing.exporter.phase !== 'idle' ||
                      !!composer.annotation,
                  }
                : undefined
            }
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
            windowHeader={features.windowHeader}
            video={state.video}
            drawing={!!composer.annotation && !state.playing && !busy}
            region={state.displayRegion}
            zoomRegions={features.zoomRegions}
            background={features.background}
            outputTime={state.timeline.sceneOutputTime}
            zoomOverlay={reviewFocusOverlay(state)}
            focusTimeMap={state.timeline.timeMap.getSegments()}
            focusPicker={
              fullscreen &&
              !state.playing &&
              !busy &&
              state.editing.exporter.phase === 'idle' &&
              !composer.annotation &&
              features.zoomApplied
                ? {
                    regions: reviewStagePickRegions(
                      state.advanced.zoom.regions,
                      state.timeline.timeMap.getSegments(),
                      state.timeline.sceneOutputTime
                    ),
                    onSelect: (id) => {
                      const region = state.advanced.zoom.regions.find((item) => item.id === id);
                      if (!region) return;
                      state.zoom.setSelection(id);
                      const sourceTime = state.timeline.timeMap.timelineToSource(
                        (region.start + region.end) / 2
                      );
                      if (sourceTime !== null) state.seek(sourceTime, false);
                    },
                  }
                : undefined
            }
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
            onPlaying={(playing) => {
              if (playing)
                state.setActiveSelection((current) =>
                  current.kind === 'none' ? current : { kind: 'none' }
                );
              state.setPlaying(playing);
            }}
            onEnded={() => state.beforeAction(state.onEnded)}
            onError={() => state.setMessage(translate('gallery.videoReview.playbackFailed'))}
          />
        )}
      </ReviewPreviewFrame>
    </main>
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
  const panelsEnabled = state.advanced.ui.mode === 'advanced';
  const panels = useReviewPanelLayout(panelsEnabled);
  const [exportRequest, requestExport] = useState(0);
  const navigation = useReviewInspectorNavigation({
    beforeAction: state.beforeAction,
    contextKey: reviewInspectorContext(state),
    contextSelection: state.activeSelection,
    selectionLabel: reviewSelectionLabel({
      selection: state.activeSelection,
      markers: state.projected.markers,
      advanced: state.advanced,
      editing: state.editing,
    }),
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
    features.mode === 'advanced' || !!editing.exporter.index?.audioCodec,
    editing.exporter.index === null || !!editing.exporter.index.audioCodec
  );
  return (
    <>
      <div
        data-ui="gallery.videoReview.workspaceScroll"
        className="h-full min-h-0 overflow-x-auto overflow-y-hidden"
      >
        <div
          ref={panels.container}
          data-ui="gallery.videoReview.workspace"
          inert={voiceover.recording}
          style={{
            gridTemplateColumns: `minmax(0,1fr) ${panels.inspectorWidth}px`,
            gridTemplateRows: `minmax(0,1fr) ${panels.timelineHeight === null ? 'auto' : `${panels.timelineHeight}px`}`,
          }}
          className={`grid h-full min-h-0 min-w-[1254px] ${voiceover.recording ? 'pb-40' : ''}`}
        >
          <ReviewPreviewBinding resource={resource} state={state} />
          <ReviewInspectorBinding
            navigation={navigation}
            resizeHandle={
              panelsEnabled ? <ReviewPanelResizeHandle resize={panels.inspector} /> : null
            }
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
            ref={panels.timeline}
            className={
              `relative ${voiceover.recording ? 'opacity-50' : ''} ` +
              (fullHeight
                ? 'col-start-1 row-start-2 min-h-0 min-w-0'
                : 'col-span-full min-h-0 min-w-0')
            }
          >
            {panelsEnabled ? <ReviewPanelResizeHandle resize={panels.timelineResize} /> : null}
            <ReviewTimelineBinding
              onOpenHistory={() => navigation.setSection('history')}
              webcam={state.webcam}
              fillHeight={panels.timelineHeight !== null}
              playbackRange={state.playbackRange}
              onPlaybackRange={state.setPlaybackRange}
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
              onCutPlacement={() =>
                state.setMessage(translate('gallery.videoReview.placementOnCut'))
              }
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
              onPlay={() => state.beforeAction(state.play)}
            />
          </div>
        </div>
      </div>
      <ReviewVoiceoverLayer voiceover={voiceover} />
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
          <ReviewLoadStatus failure={failed} />
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
  if (selection.kind === 'original-audio') return `settings:original-audio:${selection.id}`;
  if (state.advanced.ui.mode !== 'advanced') return 'comments';
  const id = 'id' in selection ? selection.id : '';
  return `settings:${selection.kind}:${id}`;
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

/** Scene controls share busy admission and the existing scene/audio writers. */
function ReviewScenePropertiesBinding({
  state,
  source,
  audio,
}: {
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
    />
  );
}

/** Both single and bulk edits use the existing advanced-content transaction and admission. */
function changeRecordedClicks(
  state: InspectorState,
  ids: readonly string[],
  patch: Partial<ReviewClickStyle> | null
) {
  if (state.busy || state.editing.exporter.phase !== 'idle' || !state.canStart()) return;
  try {
    patchReviewClicks(state.advanced.clickAnimations ?? [], ids, patch);
    state.setClickAnimations((current) => patchReviewClicks(current, ids, patch));
    if (patch?.effect && patch.effect !== 'off' && state.advanced.ui.mode !== 'advanced') {
      state.setMode('advanced');
      state.setActiveSelection(state.activeSelection);
    }
  } catch {
    state.setMessage(translate('gallery.videoReview.clickLimit'));
  }
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
      webcam={state.webcam}
      webcamRange={
        state.playbackRange ?? (state.selection.kind === 'range' ? state.selection : undefined)
      }
      advanced={state.advanced}
      selection={state.activeSelection}
      editing={state.editing}
      zoom={state.zoom}
      busy={state.busy}
      onClickAnimation={(ids, patch) => changeRecordedClicks(state, ids, patch)}
      {...(onBackToHistory ? { onOpenHistory: onBackToHistory } : {})}
      markers={state.projected.markers}
      onFocus={(region) => focusRecordedAction(state, region)}
      onPreviewFrame={(time) => {
        video.current?.pause();
        state.seek(time, false);
      }}
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
