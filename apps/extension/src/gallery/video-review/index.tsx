import { ReviewPlaybackPresentationClockContext } from './playback-presentation-clock';
import { useReviewLiveSeek } from './use-live-seek';
import { Magnet } from 'lucide-react';
import { ReviewLiveSeekIcon } from './live-seek-icon';
import { ReviewButton, reviewIconButtonClassName } from './controls';
import { resolveReviewTimelineSelection } from './timeline-batch-selection';
import { ReviewInspectorToolbarNavigation } from './review-toolbar';
import { ReviewSelectionActionsSurface } from './selection-actions';
import { reviewTimelineSelectionInterval } from './use-review-selection';
import { ReviewTimelineFragment } from './selection-fragment';
import type { ReviewPlaybackRange } from './playback-range';
import { setGalleryQuickEditUrl, clearGalleryQuickEditUrl } from '../platform/browser-driver';
import { useReviewWorkspaceColor } from './workspace-color';
import {
  useReviewInspectorNavigation,
  useReviewInspectorTrackNavigation,
  reviewTimelineInspectorCommands,
} from './inspector-navigation';
import { useReviewAudioWiring } from './voiceover-recording';
import {
  ReviewInspectorBinding,
  reviewInspectorContext,
  backupReview,
  flushReviewTextVoiceBuffers,
  leaveReviewInspector,
} from './inspector-binding';
import { useReviewProjectCommands } from './project-controls';
import { ReviewKeyboardHelp } from './keyboard-help';
import { usePresentationPreview } from './use-presentation-preview';
import { ReviewEditorPresentationDialog } from './presentation-preview-dialog';
import { resolveReviewAssetBytes } from '../../workflows/video-review/asset-bytes';
import { resolveOverlayComments } from '../../features/video/review/comments';
import { useReviewPreviewInspector } from './preview-inspector';
import {
  ReviewPreviewRendererContext,
  type useReviewPreviewPreferences,
} from './use-preview-preferences';
import { useReviewMusicImport } from './music-import';
import { AudioLibraryPicker } from '../../composition/audio-library/picker';
import { ReviewPanelResizeHandle, useReviewPanelLayout } from './panel-layout';
import { ReviewPreviewBinding } from './preview-binding';
import { ReviewLoadStatus, reviewErrorMessage } from './feedback';
import { ReviewDialog } from './review-dialog';
import { ReviewHistoryControls } from './timeline-chrome';
import { reviewSelectionLabel } from './selected-properties';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { translate, useAppLocale, usePageLocaleMetadata } from '../../platform/i18n';
import { useReviewWaveforms } from './audio-waveform';
import { ReviewTimelineBinding } from './timeline-binding';
import { useLoadedReview, type LoadedReview } from './use-session';
import { ReviewVoiceoverLayer } from './voiceover-panel';
import { useReviewEditorState } from './use-editor-state';
import { ReviewModeChoice } from './mode-choice';

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
            state.annotationEffects.cancelGesture();
            state.resetAdvanced();
          }),
      }}
    />
  );
}

type ReviewEditorProps = {
  onJoinPreview?: ((slot: 'intro' | 'outro', target?: 'fade' | 'join') => void) | undefined;
  resource: LoadedReview;
  onBack(): void;
  onClose(): void;
  onProjectCreated(aggregateId: string): void;
};

/** One immutable editor projection drives the disposable seam preview workflow. */
function useEditorPresentationPreview(
  resource: LoadedReview,
  state: ReturnType<typeof useReviewEditorState>,
  preferences: ReturnType<typeof useReviewPreviewPreferences>['preferences']
) {
  const { editing, snapshot, advanced, features } = state;
  const previewInput = useMemo(
    () =>
      editing.exporter.index
        ? {
            file: resource.file,
            index: editing.exporter.index,
            edits: snapshot.document.edits,
            advanced,
            fragmentOffset: 0,
            renderSettings: editing.exporter.renderSettings,
            comments: features.overlaysVisible ? resolveOverlayComments(snapshot.document) : [],
            clickCues: state.clickCues,
            keyCues: state.keyCues,
            readProjectAsset: resolveReviewAssetBytes,
            effectSnapshots: snapshot.snapshot.workspace.effectSnapshots ?? [],
          }
        : null,
    [
      resource.file,
      editing.exporter.index,
      snapshot.document,
      snapshot.snapshot.workspace.effectSnapshots,
      advanced,
      editing.exporter.renderSettings,
      features.overlaysVisible,
      state.clickCues,
      state.keyCues,
    ]
  );
  return usePresentationPreview(previewInput, preferences, () => state.video.current?.pause());
}

/** Keep text visibility on the same caption writer as the scene inspector. */
function reviewTimelineTextCommands(state: ReturnType<typeof useReviewEditorState>) {
  return {
    text: state.text,
    onToggleCaptions: () =>
      state.setCaptions({ ...state.text.captions, enabled: !state.text.captions.enabled }),
  };
}

/** Localize prepared window choices without adding scene/export policy to the workspace shell. */
function ReviewEditor({
  resource,
  onBack,
  onClose,
  onJoinPreview,
  onProjectCreated,
}: ReviewEditorProps) {
  const state = useReviewEditorState(resource);
  usePageLocaleMetadata(
    'videoEditor.app.documentTitle',
    state.snapshot.snapshot.workspace.project?.name ?? resource.filename
  );
  const editorReady = !state.advanced.ui.modeSelectionPending;
  const [fullHeight, setFullHeight] = useState(false);
  const panelsEnabled = state.advanced.ui.mode === 'advanced';
  const panels = useReviewPanelLayout(panelsEnabled, editorReady);
  const workspaceColor = useReviewWorkspaceColor(
    panels.container,
    state.advanced.ui.workspaceColors,
    state.setWorkspaceColor,
    editorReady
  );
  const previewSettings = useReviewPreviewInspector({
    workspaceColor,
    projectFailed: state.advancedFailed,
    retryProject: state.retryAdvanced,
  });
  const previewPreferences = previewSettings.preferences;
  const annotationMagnetEnabled = state.advanced.ui.annotationMagnetEnabled !== false;
  const liveSeek = useReviewLiveSeek(
    resource,
    state,
    previewPreferences.preferences,
    previewSettings.raster,
    state.playing || state.busy || state.editing.exporter.phase !== 'idle' || !editorReady,
    {
      enabled: state.advanced.ui.liveSeekEnabled !== false,
      onChange: (liveSeekEnabled) => state.setTimelinePreferences({ liveSeekEnabled }),
    }
  );
  const reportPresentedTime = state.onPresentedTime;
  const reportHoverPresentedTime = liveSeek.onPresentedTime;
  const onLiveSeekPresented = useCallback(
    (identity: string, time: number) => {
      reportPresentedTime(identity, time);
      if (identity === resource.url) reportHoverPresentedTime(time);
    },
    [reportPresentedTime, resource.url, reportHoverPresentedTime]
  );
  const { onImportAudioFile, voiceover } = useReviewAudioWiring(state);
  const navigationState = useReviewEditorNavigation(state, voiceover.recording);
  const { navigation, requestExport, historyCommands, trackNavigation } = navigationState;
  const music = useReviewMusicImport(state);
  const { audio, canvasComments, editing, snapshot, composer, advanced, features, zoom, busy } =
    state;
  const exitOwner = useRef({ active: true, resource, session: state.session });
  exitOwner.current.resource = resource;
  exitOwner.current.session = state.session;
  useEffect(() => {
    const owner = exitOwner.current;
    owner.active = true;
    return () => {
      owner.active = false;
    };
  }, []);
  const leaveEditor = () =>
    leaveReviewInspector(
      state,
      canvasComments,
      onBack,
      () =>
        exitOwner.current.active &&
        exitOwner.current.resource === resource &&
        exitOwner.current.session === state.session
    );
  const joinPreview = useEditorPresentationPreview(resource, state, previewPreferences.preferences);
  const projectCommands = useReviewProjectCommands(
    state,
    () => flushReviewTextVoiceBuffers(state, canvasComments),
    onProjectCreated
  );

  const waveforms = useReviewWaveforms(
    resource.file,
    state.source.duration,
    { voiceover: features.voiceover, music: features.music },
    features.mode === 'advanced' || !!editing.exporter.index?.audioCodec,
    editing.exporter.index === null || !!editing.exporter.index.audioCodec
  );
  const applyInterval = (range: ReviewPlaybackRange) => {
    state.pause();
    if (range.result) state.setPlaybackRange(range);
    else {
      state.setPlaybackRange(null);
      state.seek(range.start, false);
    }
    state.setSelection({ kind: 'range', start: range.start, end: range.end });
  };
  const timelineRow = panels.timelineHeight === null ? 'auto' : `${panels.timelineHeight}px`;
  if (!editorReady) {
    return (
      <ReviewModeChoice filename={resource.filename} onSelect={state.setMode} onBack={onBack} />
    );
  }
  return (
    <ReviewSelectionActionsSurface
      selection={state.activeSelection}
      onSelectInterval={(keys) =>
        state.beforeAction(() => {
          const range = reviewTimelineSelectionInterval(
            keys,
            state.activeSelection,
            {
              document: state.snapshot.document,
              advanced: state.advanced,
              duration: state.source.duration,
              markers: state.projected.markers,
              segments: state.timeline.timeMap.getSegments(),
            },
            state.cursorFocusKeys
          );
          if (!range) return;
          applyInterval(range);
        })
      }
      fragmentAction={(keys) => (
        <ReviewTimelineFragment
          state={state}
          keys={keys}
          onSelectInterval={applyInterval}
          onOpenExport={() => requestExport((current) => current + 1)}
        />
      )}
      onSelectKey={(key) => {
        if (!key) {
          state.setActiveSelection({ kind: 'none' });
          return;
        }
        const selection = resolveReviewTimelineSelection(key, state.advanced);
        if (!selection) return;
        if (selection.kind === 'cursor-focus') {
          const point = state.cursorFocusKeys.find((point) => point.id === selection.id);
          if (point) state.selectCursorFocusKey(point.id, point.sourceTime);
        } else state.setActiveSelection(selection);
        navigation.setSection('selected');
      }}
      visible={navigation.shown === 'selected' && !voiceover.recording}
      disabled={busy || editing.exporter.phase !== 'idle'}
    >
      <ReviewPlaybackPresentationClockContext.Provider value={state.playheadClock}>
        <ReviewPreviewRendererContext.Provider value={previewPreferences.preferences.renderer}>
          <ReviewEditorPresentationDialog preview={joinPreview} />
          <div
            ref={panels.container}
            data-ui="gallery.videoReview.workspace"
            onPointerDownCapture={(event) => {
              const target = event.target;
              if (
                target instanceof Element &&
                target.closest('[data-ui="gallery.videoReview.timeline"]') &&
                target.closest(
                  '[data-review-removal-key],[data-review-action-key],[data-cursor-focus-key]'
                )
              )
                state.pause();
              if (
                target instanceof Element &&
                target.closest('[data-ui="gallery.videoReview.inspector"]') &&
                target.closest(
                  'input,textarea,select,[role="slider"],[role="spinbutton"],[role="combobox"],[contenteditable="true"]'
                )
              )
                state.pause();
            }}
            onFocusCapture={(event) => {
              const target = event.target;
              if (
                target instanceof Element &&
                target.closest('[data-ui="gallery.videoReview.inspector"]') &&
                target.matches(
                  'input,textarea,select,[role="slider"],[role="spinbutton"],[role="combobox"],[contenteditable="true"]'
                )
              )
                state.pause();
            }}
            style={{
              ...workspaceColor.style,
              gridTemplateColumns: `minmax(0,1fr) ${panels.inspectorWidth}px`,
              gridTemplateRows: `minmax(0,1fr) ${timelineRow}`,
            }}
            className="grid h-full min-h-0 min-w-0"
          >
            <div className="contents" inert={voiceover.recording}>
              <ReviewPreviewBinding
                annotationMagnetEnabled={annotationMagnetEnabled}
                previewOverlay={
                  <canvas
                    ref={liveSeek.canvas}
                    hidden={!liveSeek.visible}
                    data-ui="gallery.videoReview.liveSeekFrame"
                    data-time={liveSeek.time ?? undefined}
                    className="pointer-events-none absolute inset-0 z-30 h-full w-full"
                  />
                }
                onOpenPreviewSettings={navigation.openPreview}
                previewPreferences={previewPreferences.preferences}
                onPreviewRaster={previewSettings.setRaster}
                onPreviewRendererStatus={previewSettings.setRendererStatus}
                resource={resource}
                state={{ ...state, onPresentedTime: onLiveSeekPresented }}
                sceneActive={
                  features.mode === 'advanced' &&
                  navigation.shown === 'track' &&
                  trackNavigation.track === 'source' &&
                  trackNavigation.tab === 'settings'
                }
              />
            </div>
            <ReviewInspectorBinding
              onProject={() => {
                if (voiceover.recording) voiceover.requestClose.current?.();
                else trackNavigation.back();
              }}
              backLabel={trackNavigation.backLabel}
              inspectorTrack={trackNavigation.track}
              trackTab={trackNavigation.tab}
              onTrackTab={trackNavigation.setTab}
              onRenameProject={projectCommands.rename}
              recording={
                voiceover.recording ? <ReviewVoiceoverLayer voiceover={voiceover} /> : undefined
              }
              onJoinPreview={onJoinPreview ?? joinPreview.open}
              preview={previewSettings.inspector}
              navigation={navigation}
              resizeHandle={
                panelsEnabled ? <ReviewPanelResizeHandle resize={panels.inspector} /> : null
              }
              fullHeight={fullHeight || voiceover.recording}
              onToggleHeight={() => setFullHeight((value) => !value)}
              resource={resource}
              state={state}
              canvasComments={canvasComments}
              audio={audio}
              onBack={onBack}
              onClose={onClose}
            />
            <div
              inert={voiceover.recording}
              ref={panels.timeline}
              className={
                `relative ${voiceover.recording ? 'opacity-50' : ''} ` +
                (fullHeight || voiceover.recording
                  ? 'col-start-1 row-start-2 min-h-0 min-w-0'
                  : 'col-span-full min-h-0 min-w-0')
              }
            >
              {panelsEnabled ? <ReviewPanelResizeHandle resize={panels.timelineResize} /> : null}
              <ReviewTimelineBinding
                onHoverTime={liveSeek.hover}
                onHoverIntent={(starting) => {
                  if (starting) liveSeek.hold();
                  else liveSeek.finishIntent(() => state.video.current?.currentTime);
                }}
                interactionEditor={state.interactionEditor}
                onInteractionAdded={() => navigation.setSection('selected')}
                cursorMotion={state.cursorMotion}
                onOpenProject={trackNavigation.openProject}
                onOpenTrack={trackNavigation.openTrack}
                onTrackChange={trackNavigation.setTrack}
                onHistoryRange={state.setHistoryRange}
                cursorArchiveAvailable={state.cursorArchiveAvailable}
                annotationEffects={state.annotationEffects}
                annotationToolCancellation={state.annotationToolCancellation}
                effectSnapshots={state.snapshot.snapshot.workspace.effectSnapshots ?? []}
                annotationSourceId={state.snapshot.snapshot.workspace.sourceAssetId}
                {...reviewTimelineTextCommands(state)}
                {...reviewTimelineInspectorCommands({
                  video: state.video,
                  pause: state.pause,
                  select: state.setActiveSelection,
                  navigation,
                  selectedTextId: state.text.selectedId,
                  selection: state.activeSelection,
                  requestExport,
                })}
                webcam={state.webcam}
                fillHeight={panels.timelineHeight !== null}
                playbackRange={state.playbackRange}
                onPlaybackRange={state.setPlaybackRange}
                zoomAnchor={state.zoomAnchor}
                beforeAction={state.beforeAction}
                historyControls={<ReviewHistoryControlBinding state={state} />}
                inspectorControls={
                  <ReviewInspectorToolbarNavigation
                    navigation={navigation}
                    advanced={features.mode === 'advanced'}
                    busy={busy || editing.exporter.phase !== 'idle'}
                  />
                }
                navigationControls={
                  <>
                    {features.mode === 'advanced' && (
                      <ReviewButton
                        label={translate('gallery.videoReview.annotationMagnet')}
                        title={translate('gallery.videoReview.annotationMagnetHint')}
                        className={reviewIconButtonClassName}
                        aria-pressed={annotationMagnetEnabled}
                        data-ui="gallery.videoReview.annotationMagnetToggle"
                        onClick={() =>
                          state.setTimelinePreferences({
                            annotationMagnetEnabled: !annotationMagnetEnabled,
                          })
                        }
                      >
                        <Magnet size={16} aria-hidden="true" />
                      </ReviewButton>
                    )}
                    <ReviewButton
                      label={translate('gallery.videoReview.liveSeek')}
                      className={reviewIconButtonClassName}
                      aria-pressed={liveSeek.enabled}
                      disabled={!liveSeek.available || busy || editing.exporter.phase !== 'idle'}
                      data-ui="gallery.videoReview.liveSeekToggle"
                      onClick={() => liveSeek.setEnabled(!liveSeek.enabled)}
                    >
                      <ReviewLiveSeekIcon />
                    </ReviewButton>
                  </>
                }
                utilityControls={
                  <ReviewKeyboardHelp
                    onBasicMode={
                      features.mode === 'advanced' ? () => state.setMode('basic') : undefined
                    }
                    busy={busy || editing.exporter.phase !== 'idle'}
                    onClose={panelsEnabled ? leaveEditor : undefined}
                    onNewProject={projectCommands.newProject}
                    onBackup={() => void state.run(() => backupReview(state, canvasComments))}
                  />
                }
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
                onToggleActions={
                  advanced.ui.mode === 'advanced'
                    ? () =>
                        state.beforeAction(() =>
                          state.setActionsEnabled(advanced.actionsEnabled === false)
                        )
                    : undefined
                }
                setTrackVisibility={state.setTrackVisibility}
                setMode={state.setMode}
                telemetryAvailable={state.projected.markers.length > 0}
                time={state.time}
                onPause={state.pause}
                insertionPoint={state.insertionPoint}
                playing={state.playing}
                navigationRevision={state.navigationRevision}
                markers={state.projected.markers}
                captureCapabilities={state.projected.captureCapabilities}
                zoom={zoom}
                audio={audio}
                audioState={advanced.audio}
                waveforms={waveforms}
                onImportAudioFile={(...args) =>
                  state.beforeAction(() => onImportAudioFile(...args))
                }
                onRecordVoiceover={() => state.beforeAction(voiceover.open)}
                onOpenMusic={music.open}
                onClearSelection={() => state.setActiveSelection({ kind: 'none' })}
                selectedObject={state.activeSelection.kind !== 'none'}
                cursorFocusKeys={state.cursorFocusKeys}
                {...historyCommands}
                onComment={state.selectComment}
                onSeekResult={(time) => {
                  state.seekResult(time);
                  liveSeek.commit(state.video.current?.currentTime ?? state.time);
                }}
                onSeek={(time, snap) => {
                  state.seek(time, snap);
                  liveSeek.commit(state.video.current?.currentTime ?? time);
                }}
                onPlay={() => state.beforeAction(state.play)}
              />
            </div>
          </div>
          {music.drawer && <AudioLibraryPicker {...music.drawer} />}
        </ReviewPreviewRendererContext.Provider>
      </ReviewPlaybackPresentationClockContext.Provider>
    </ReviewSelectionActionsSurface>
  );
}

/** Native modal owns focus/inert; Escape cancels drawing, header navigation exits after recovery flush. */
export function VideoReview({
  aggregateId,
  onBack,
  onClose = onBack,
  onJoinPreview,
}: {
  onJoinPreview?: ((slot: 'intro' | 'outro', target?: 'fade' | 'join') => void) | undefined;
  aggregateId: string;
  onBack(): void;
  onClose?(): void;
}) {
  useAppLocale();
  const [activeId, setActiveId] = useState(aggregateId);
  useEffect(() => setActiveId(aggregateId), [aggregateId]);
  const { resource, failed, retry } = useLoadedReview(activeId);
  useEffect(() => {
    setGalleryQuickEditUrl(activeId);
    return () => clearGalleryQuickEditUrl(activeId);
  }, [activeId]);
  return (
    <ReviewDialog>
      {resource ? (
        <ReviewEditor
          key={`${resource.snapshot.workspace.aggregateId}:${resource.snapshot.workspace.createdAt}`}
          resource={resource}
          onProjectCreated={(id) => {
            setActiveId(id);
            retry();
          }}
          onBack={onBack}
          onClose={onClose}
          onJoinPreview={onJoinPreview}
        />
      ) : (
        <ReviewLoadStatus failure={failed} onBack={onBack} onRetry={retry} />
      )}
    </ReviewDialog>
  );
}

/** Inspector navigation owns selection context and explicit export requests. */
function useReviewEditorNavigation(
  state: ReturnType<typeof useReviewEditorState>,
  recordingAvailable: boolean
) {
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
    recordingAvailable,
    exportRequest,
  });
  const historyCommands = {
    onNavigateCursorFocus: (time: number, key?: (typeof state.cursorFocusKeys)[number]) => {
      state.selectCursorFocusKey(key?.id, time);
      navigation.setSection('selected');
    },
    onMoveCursorFocus: state.moveCursorFocusKey,
    onCursorFocusKey: (
      key: Parameters<
        NonNullable<Parameters<typeof ReviewTimelineBinding>[0]['onCursorFocusKey']>
      >[0]
    ) => {
      state.selectCursorFocusKey(key.id, key.sourceTime);
      navigation.setSection('selected');
    },
    onAddCursorFocusKey: (time: number) => {
      state.addCursorFocusKey(time);
      navigation.setSection('selected');
    },
    onMarker: (marker: Parameters<Parameters<typeof ReviewTimelineBinding>[0]['onMarker']>[0]) => {
      if (!state.canStart()) return;
      state.setActiveSelection({ kind: 'telemetry', ref: marker.ref });
      navigation.setSection('selected');
    },
  };
  const trackNavigation = useReviewInspectorTrackNavigation({
    navigation,
    selection: state.activeSelection,
    beforeAction: state.beforeAction,
    cancelAnnotation: state.annotationToolCancellation,
    setDrawing: state.zoom.setDrawing,
    setCutting: state.editing.setCutting,
    setAudioTool: state.audio.setOriginalTool,
    setAudioRange: state.audio.setOriginalRangeSelected,
    select: state.setActiveSelection,
  });
  return { navigation, requestExport, historyCommands, trackNavigation };
}
