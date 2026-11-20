import { openGalleryPage } from '../../platform/navigation/extension-pages';
import { ReviewInspectorActions } from './edit-actions';
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
import type { ReviewPreviewRendererStatus } from './preview-presentation-state';
import { useReviewPreviewInspector } from './preview-inspector';
import {
  ReviewPreviewRendererContext,
  useReviewPreviewPreferences,
} from './use-preview-preferences';
import { useReviewMusicImport } from './music-import';
import { AudioLibraryPicker } from '../../composition/audio-library/picker';
import { ReviewPanelResizeHandle, useReviewPanelLayout } from './panel-layout';
import { ReviewPreviewBinding, type ReviewPreviewInputs } from './preview-binding';
import type { ReviewStageBinding } from './stage-binding';
import { resolveQuickEditEffectiveFeatures } from '../../features/video/review/advanced/effective';
import { resolveReviewCursorFocusPath } from '../../features/video/review/advanced/cursor-focus-path';
import { resolveReviewOutputProfile } from '../../workflows/video-review/render-settings';
import { planReviewPresentationSequence } from '../../features/video/review/presentation-sequence';
import { ReviewLoadStatus, reviewErrorMessage } from './feedback';
import { ReviewDialog } from './review-dialog';
import { ReviewHistoryControls } from './timeline-chrome';
import { ReviewEditHistory } from './edit-history';
import { reviewSelectionLabel, createReviewInspectorEditCommands } from './selected-properties';
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
        saving: snapshot.pending > 0 || snapshot.saving === true,
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
  onProjectCreated(aggregateId: string, sourceMediaId: string): void;
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
  return usePresentationPreview(previewInput, preferences, state.pause);
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
  const previewPreferences = useReviewPreviewPreferences();
  const [previewRendererStatus, setPreviewRendererStatus] =
    useState<ReviewPreviewRendererStatus | null>(null);
  const state = useReviewEditorState(
    resource,
    previewPreferences.preferences.renderer === 'gpu' &&
      previewRendererStatus?.decodedSourceIdentity === resource.url
  );
  const interruptParameterPlayback = (target: EventTarget | null) => {
    if (
      !(target instanceof Element) ||
      !target.closest('[data-ui="gallery.videoReview.inspector"]') ||
      !target.closest(
        'input,textarea,select,[role="slider"],[role="spinbutton"],[role="combobox"],[contenteditable="true"]'
      )
    )
      return;
    const mode = state.transport.getStatusSnapshot().mode;
    if (mode !== 'playing' && mode !== 'preparing' && mode !== 'recovering') return;
    const context = state.commands.capture();
    if (context) state.commands.admit(context, () => {});
  };
  const previewInputs = useReviewPreviewInputs(resource, state);
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
    preferences: previewPreferences,
    rendererStatus: previewRendererStatus,
    workspaceColor,
    projectFailed: state.advancedFailed,
    retryProject: state.retryAdvanced,
  });
  const annotationMagnetEnabled = state.advanced.ui.annotationMagnetEnabled !== false;
  const liveSeek = useReviewLiveSeek(
    resource,
    {
      advanced: state.advanced,
      source: state.source,
      resultTime: state.transport.getStatusSnapshot().position.resultTime,
      snapshot: state.snapshot,
      exporter: state.exporter,
      keyCues: state.keyCues,
      clickCues: state.clickCues,
    },
    previewPreferences.preferences,
    previewSettings.raster,
    state.playing || state.busy || state.editing.exporter.phase !== 'idle' || !editorReady,
    {
      enabled: state.advanced.ui.liveSeekEnabled !== false,
      onChange: (liveSeekEnabled) => state.setTimelinePreferences({ liveSeekEnabled }),
    }
  );
  const reportHoverPresentedTime = liveSeek.onPresentedTime;
  const onLiveSeekPresented = useCallback(
    (identity: string, time: number) => {
      if (identity === resource.url) reportHoverPresentedTime(time);
    },
    [resource.url, reportHoverPresentedTime]
  );
  const { onImportAudioFile, onPrepareImportAudioFile, voiceover } = useReviewAudioWiring(state);
  const navigationState = useReviewEditorNavigation(state, voiceover.recording);
  const { navigation, requestExport, historyCommands, trackNavigation } = navigationState;
  const music = useReviewMusicImport(state);
  const { audio, canvasComments, editing, snapshot, composer, advanced, features, zoom, busy } =
    state;
  const inspectorCurrent = useRef(state);
  inspectorCurrent.current = state;
  const inspectorEditCommands = useMemo(
    () => createReviewInspectorEditCommands(() => inspectorCurrent.current.editing),
    []
  );
  const inspectorMedia = useMemo(
    () => ({
      pause: () => inspectorCurrent.current.pause(),
      seek: (time: number, playing?: boolean) => inspectorCurrent.current.seek(time, playing),
      seekResult: (time: number) => inspectorCurrent.current.seekResult(time),
      play: () => inspectorCurrent.current.transport.play(),
      readPosition: () => {
        const current = inspectorCurrent.current;
        const position = current.commands.capture()?.position;
        return {
          sourceTime: position?.source?.sourceTime ?? position?.media?.time ?? current.time,
          resultTime: position?.resultTime ?? current.timeline.sceneOutputTime,
          seekRevision: current.seekRevision,
        };
      },
      readVideo: () => inspectorCurrent.current.video.current,
      toSourceTime: (time: number) =>
        inspectorCurrent.current.timeline.timeMap.timelineToSource(time),
    }),
    []
  );
  const inspectorFragment = state.playbackRange
    ? { kind: 'range' as const, ...state.playbackRange }
    : state.selection.kind === 'range'
      ? state.selection
      : null;
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
  const leaveEditor = () => {
    state.pause();
    leaveReviewInspector(
      state,
      canvasComments,
      onBack,
      () =>
        exitOwner.current.active &&
        exitOwner.current.resource === resource &&
        exitOwner.current.session === state.session
    );
  };
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
              const field =
                event.target instanceof Element
                  ? event.target.closest(
                      [
                        'textarea,input:not([type])',
                        'input:is([type="text"],[type="number"],[type="search"])',
                        '[contenteditable]:not([contenteditable="false"])',
                      ].join(',')
                    )
                  : null;
              const continuingFieldEdit =
                field !== null && field === event.currentTarget.ownerDocument.activeElement;
              if (event.button === 0 && !continuingFieldEdit) state.advancedState.endTyping();
              interruptParameterPlayback(event.target);
            }}
            onFocusCapture={(event) => interruptParameterPlayback(event.target)}
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
                onPreviewRendererStatus={setPreviewRendererStatus}
                {...previewInputs}
                onPresentedTime={onLiveSeekPresented}
                sceneActive={
                  features.mode === 'advanced' &&
                  navigation.shown === 'track' &&
                  trackNavigation.track === 'source'
                }
                watermarkEditingAvailability={trackNavigation.view.sourceSettings}
              />
            </div>
            <ReviewInspectorBinding
              onProject={() => {
                if (voiceover.recording) voiceover.requestClose.current?.();
                else trackNavigation.back();
              }}
              backLabel={trackNavigation.backLabel}
              inspectorTrack={trackNavigation.track}
              trackView={trackNavigation.view}
              onRenameProject={projectCommands.rename}
              recording={
                voiceover.recording ? <ReviewVoiceoverLayer voiceover={voiceover} /> : undefined
              }
              onJoinPreview={onJoinPreview ?? joinPreview.open}
              preview={previewSettings.inspector}
              editHistory={
                navigation.shown === 'editHistory' ? (
                  <ReviewEditHistory
                    operations={snapshot.snapshot.workspace.history}
                    cursor={snapshot.snapshot.workspace.cursor}
                    busy={busy || !!state.composer.before || editing.exporter.phase !== 'idle'}
                    autosaveEnabled={snapshot.autosaveEnabled}
                    onSeek={state.moveHistory}
                    onStart={() => state.moveHistory('start')}
                    onReset={() => state.moveHistory('reset')}
                  />
                ) : null
              }
              navigation={navigation}
              resizeHandle={
                panelsEnabled ? <ReviewPanelResizeHandle resize={panels.inspector} /> : null
              }
              fullHeight={fullHeight || voiceover.recording}
              onToggleHeight={() => setFullHeight((value) => !value)}
              resource={resource}
              model={{
                document: snapshot.document,
                workspace: {
                  project: snapshot.snapshot.workspace.project,
                  aggregateId: snapshot.snapshot.workspace.aggregateId,
                  sourceAssetId: snapshot.snapshot.workspace.sourceAssetId,
                  effectSnapshots: snapshot.snapshot.workspace.effectSnapshots,
                },
                save: {
                  pending: snapshot.pending,
                  error: snapshot.error,
                  saving: snapshot.saving || (snapshot.autosaveEnabled && snapshot.dirty),
                  advancedPending: state.advancedPending,
                  advancedFailed: state.advancedFailed,
                },
                advanced: state.advanced,
                scene: {
                  zoomRegions: features.zoomRegions,
                  canvas: features.canvas,
                  background: features.background,
                  windowHeader: features.windowHeader,
                },
                activeSelection: state.activeSelection,
                selection: state.selection,
                playbackRange: state.playbackRange,
                selected: state.selected,
                busy: state.busy,
                playing: state.playing,
                cursorFocusPath: state.cursorFocusPath,
                cursorFocusKeys: state.cursorFocusKeys,
                projected: {
                  markers: state.projected.markers,
                  captureCapabilities: state.projected.captureCapabilities,
                },
                segments: state.timeline.timeMap.getSegments(),
                resultDuration: state.timeline.resultDuration,
              }}
              editors={{
                annotationEffects: state.annotationEffects,
                cursorMotion: state.cursorMotion,
                text: state.text,
                zoom: state.zoom,
                webcam: state.webcam,
                watermark: state.watermark,
                presentation: state.presentation,
                backgroundImport: state.backgroundImport,
                interactionEditor: state.interactionEditor,
                composer: state.composer,
                editing: { selected: editing.selected, commands: inspectorEditCommands },
              }}
              commands={{
                activation: state.commands,
                setCursorFocusPath: state.setCursorFocusPath,
                setTrackVisibility: state.setTrackVisibility,
                setKeyAnimations: state.setKeyAnimations,
                setActionAudio: state.setActionAudio,
                setClickAnimations: state.setClickAnimations,
                setBackground: state.setBackground,
                previewBackground: state.previewBackground,
                setCanvas: state.setCanvas,
                setCaptions: state.setCaptions,
                setWindowHeader: state.setWindowHeader,
                setSourceFilters: state.setSourceFilters,
                setCameraFollowDefaults: state.setCameraFollowDefaults,
                beforeAction: state.beforeAction,
                run: state.run,
                runComposer: state.runComposer,
                canStart: state.canStart,
                performAction: state.performAction,
                setActiveSelection: state.setActiveSelection,
                selectCursorFocusKey: state.selectCursorFocusKey,
                setMode: state.setMode,
                setHovered: state.setHovered,
                setBusy: state.setBusy,
                setMessage: state.setMessage,
                selectComment: state.selectComment,
                add: state.add,
                leaveNewNote: state.leaveNewNote,
                retryAdvanced: state.retryAdvanced,
                flushAdvanced: state.flushAdvanced,
                registerSpeechFlush: state.registerSpeechFlush,
                setVoiceoverSilent: state.setVoiceoverSilent,
                actionSoundPreview: state.actionSoundPreview,
              }}
              media={inspectorMedia}
              output={{
                index: editing.exporter.index,
                phase: editing.exporter.phase,
                result: editing.exporter.result
                  ? { receipt: editing.exporter.result.receipt }
                  : null,
                presentationDuration: editing.exporter.presentationDuration,
                hasBookends: editing.exporter.hasBookends,
              }}
              exportActions={
                <ReviewInspectorActions
                  exporter={editing.exporter}
                  fragment={
                    inspectorFragment
                      ? { selection: inspectorFragment, edits: snapshot.document.edits }
                      : undefined
                  }
                  toolKey={`${editing.mode}:${zoom.drawing}:${zoom.insertionType}:${audio.originalTool}`}
                  onOpenResult={(mediaId) => {
                    void state.run(() => openGalleryPage({ mediaId }));
                  }}
                  advanced={advanced.ui.mode === 'advanced'}
                  hasEdits={snapshot.document.edits.length > 0}
                  busy={busy}
                  composerBusy={!!composer.before}
                  onExport={() => state.beforeAction(() => void editing.exporter.start())}
                />
              }
              canvasComments={canvasComments}
              audio={{
                assets: audio.assets,
                selected: audio.selected,
                selectedOriginal: audio.selectedOriginal,
                patchClip: audio.patchClip,
                removeClip: audio.removeClip,
                patchOriginal: audio.patchOriginal,
                removeOriginal: audio.removeOriginal,
                setOriginal: audio.setOriginal,
                setLaneVolume: audio.setLaneVolume,
              }}
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
                commands={state.commands}
                onHoverTime={liveSeek.hover}
                onHoverIntent={(starting) => {
                  if (starting) liveSeek.hold();
                  else
                    liveSeek.finishIntent(
                      () => state.transport.getStatusSnapshot().position.resultTime ?? undefined
                    );
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
                    onOpenEditHistory={() => navigation.setSection('editHistory')}
                    onBasicMode={
                      features.mode === 'advanced' ? () => state.setMode('basic') : undefined
                    }
                    busy={busy || editing.exporter.phase !== 'idle'}
                    onClose={panelsEnabled ? leaveEditor : undefined}
                    onNewProject={projectCommands.newProject}
                    onBackup={
                      resource.original &&
                      snapshot.snapshot.workspace.revision === resource.snapshot.workspace.revision
                        ? undefined
                        : () => void state.run(() => backupReview(state, canvasComments))
                    }
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
                onImportAudioFile={onImportAudioFile}
                onPrepareImportAudioFile={onPrepareImportAudioFile}
                onRecordVoiceover={() => state.beforeAction(voiceover.open)}
                onOpenMusic={music.open}
                onClearSelection={() => state.setActiveSelection({ kind: 'none' })}
                selectedObject={state.activeSelection.kind !== 'none'}
                cursorFocusKeys={state.cursorFocusKeys}
                {...historyCommands}
                onComment={state.selectComment}
                onSeekResult={(time) => {
                  state.seekResult(time);
                  const accepted = state.transport.getStatusSnapshot().position.resultTime;
                  if (accepted !== null) liveSeek.commit(accepted);
                }}
                onSeek={(time, snap) => {
                  state.seek(time, snap);
                  const accepted = state.transport.getStatusSnapshot().position.resultTime;
                  if (accepted !== null) liveSeek.commit(accepted);
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
  sourceMediaId,
  onBack,
  onClose = onBack,
  onJoinPreview,
}: {
  onJoinPreview?: ((slot: 'intro' | 'outro', target?: 'fade' | 'join') => void) | undefined;
  aggregateId: string;
  sourceMediaId?: string;
  onBack(): void;
  onClose?(): void;
}) {
  useAppLocale();
  const [active, setActive] = useState({ aggregateId, sourceMediaId });
  useEffect(() => setActive({ aggregateId, sourceMediaId }), [aggregateId, sourceMediaId]);
  const { resource, failed, retry } = useLoadedReview(active.aggregateId, active.sourceMediaId);
  useEffect(() => {
    let routeId: string | undefined;
    const loaded =
      resource &&
      (resource.snapshot.workspace.aggregateId === active.aggregateId ||
        (!active.sourceMediaId && resource.original?.mediaId === active.aggregateId));
    const publishRoute = () => {
      let proposed = active.sourceMediaId ?? active.aggregateId;
      if (loaded) {
        const workspace = resource.session.getSnapshot().snapshot.workspace;
        if (!resource.original || workspace.revision > resource.snapshot.workspace.revision)
          proposed = workspace.aggregateId;
      }
      if (proposed === routeId) return;
      routeId = proposed;
      setGalleryQuickEditUrl(routeId);
    };
    publishRoute();
    const unsubscribe =
      loaded && resource.original ? resource.session.subscribe(publishRoute) : null;
    return () => {
      unsubscribe?.();
      if (routeId !== undefined) clearGalleryQuickEditUrl(routeId);
    };
  }, [active, resource]);
  return (
    <ReviewDialog>
      {resource ? (
        <ReviewEditor
          key={`${resource.snapshot.workspace.aggregateId}:${resource.snapshot.workspace.createdAt}`}
          resource={resource}
          onProjectCreated={(id, originalId) => {
            setActive({ aggregateId: id, sourceMediaId: originalId });
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

type EditorState = ReturnType<typeof useReviewEditorState>;
type StageProps = Parameters<typeof ReviewStageBinding>[0];
type PreviewEditorInput = Pick<
  EditorState,
  | 'busy'
  | 'playing'
  | 'voiceoverSilent'
  | 'time'
  | 'playheadClock'
  | 'seekRevision'
  | 'message'
  | 'setMessage'
  | 'beforeAction'
  | 'play'
  | 'setActiveSelection'
  | 'seek'
  | 'keyCues'
  | 'clickCues'
  | 'source'
  | 'video'
  | 'displayRegion'
  | 'onTime'
  | 'setSelection'
  | 'onMediaPlayback'
  | 'onEnded'
  | 'onMediaError'
  | 'recovering'
> & {
  transport?: EditorState['transport'];
  onMediaReady?: EditorState['onMediaReady'];
  preparingPlayback?: EditorState['preparingPlayback'];
  cursorMotion?: EditorState['cursorMotion'];
  history?: EditorState['history'];
  setCursorFocusPath?: EditorState['setCursorFocusPath'];
  selectCursorFocusKey?: EditorState['selectCursorFocusKey'];
  cursorFocusPath?: EditorState['cursorFocusPath'];
  cursorFocusKeys?: EditorState['cursorFocusKeys'];
  annotationEffects?: EditorState['annotationEffects'];
  activeSelection?: EditorState['activeSelection'];
  text: Pick<EditorState['text'], 'jump'>;
  features: Pick<
    EditorState['features'],
    | 'cursorMotions'
    | 'webcam'
    | 'canvas'
    | 'sourceFilters'
    | 'windowHeader'
    | 'zoomRegions'
    | 'background'
    | 'zoomApplied'
    | 'zoomTrackVisible'
    | 'overlaysVisible'
    | 'annotationEffects'
  >;
  composer: Pick<EditorState['composer'], 'annotation' | 'change'>;
  snapshot: {
    document: Pick<EditorState['snapshot']['document'], 'edits' | 'canvasComments' | 'annotations'>;
  };
  canvasComments: StageProps['canvasComments'];
  audio: Pick<EditorState['audio'], 'originalFeedback' | 'dismissOriginalFeedback'>;
  webcam: Pick<EditorState['webcam'], 'failed' | 'pending' | 'retry'> &
    NonNullable<StageProps['webcam']>['editor'];
  seekResult?: EditorState['seekResult'];
  timeline: Pick<EditorState['timeline'], 'sceneOutputTime' | 'resultDuration' | 'timeMap'> &
    Partial<Pick<EditorState['timeline'], 'readOutputTime' | 'outputTime'>>;
  editing: { exporter: Pick<EditorState['editing']['exporter'], 'phase'> };
  advanced: EditorState['advanced'];
  backgroundPreview?: EditorState['backgroundPreview'];
  presentation: Pick<EditorState['presentation'], 'settings'>;
  watermark: Pick<
    EditorState['watermark'],
    'settings' | 'pending' | 'preview' | 'change' | 'onResourceError' | 'resourceRetryGeneration'
  >;
  exporter: Pick<EditorState['exporter'], 'retryAssetAvailability' | 'index' | 'renderSettings'>;
  backgroundImport: Pick<EditorState['backgroundImport'], 'pending'>;
  zoom: Pick<
    EditorState['zoom'],
    'selected' | 'previewRegion' | 'preview' | 'previewChanges' | 'change' | 'setSelection'
  >;
} & Pick<EditorState, 'readPosition'>;

/** Root composition adapts editor owners once; preview consumers receive only their own ports. */
export function useReviewPreviewInputs(
  resource: Pick<LoadedReview, 'file' | 'url' | 'session'> &
    Partial<Pick<LoadedReview, 'telemetry'>>,
  state: PreviewEditorInput
): ReviewPreviewInputs {
  const latest = useRef(state);
  latest.current = state;
  const segments = state.timeline.timeMap.getSegments();
  const advanced = state.advanced.ui.mode === 'advanced';
  const captionEnabled = resolveQuickEditEffectiveFeatures(state.advanced).captionsApplied;
  const captions = useMemo(
    () =>
      captionEnabled && state.advanced.captions
        ? {
            document: state.advanced.text,
            settings: state.advanced.captions,
            segments,
          }
        : undefined,
    [captionEnabled, state.advanced.text, state.advanced.captions, segments]
  );
  const effectSnapshots = resource.session.getSnapshot().snapshot.workspace.effectSnapshots;
  const annotationLane = state.annotationEffects?.previewLane ?? state.features.annotationEffects;
  const annotations = useMemo(
    () =>
      state.features.annotationEffects
        ? {
            lane: annotationLane!,
            snapshots: effectSnapshots ?? [],
            segments,
          }
        : undefined,
    [state.features.annotationEffects, annotationLane, effectSnapshots, segments]
  );
  const profile = useMemo(() => {
    if (!state.exporter.index) return null;
    try {
      return resolveReviewOutputProfile(
        state.exporter.index,
        state.advanced,
        state.exporter.renderSettings
      );
    } catch {
      return null;
    }
  }, [state.exporter.index, state.advanced, state.exporter.renderSettings]);
  const dimensionsSupported = profile?.dimensionsSupported;
  const numerator = profile?.rate.numerator;
  const denominator = profile?.rate.denominator;
  const outerFadePlan = useMemo(() => {
    if (!advanced || !dimensionsSupported || numerator === undefined || denominator === undefined)
      return undefined;
    const result = planReviewPresentationSequence({
      settings: state.presentation.settings,
      mainDuration: state.timeline.resultDuration,
      fragmentOffset: 0,
      includeBookends: true,
      rate: { numerator, denominator },
    });
    return result.ok ? result.plan : undefined;
  }, [
    advanced,
    dimensionsSupported,
    numerator,
    denominator,
    state.presentation.settings,
    state.timeline.resultDuration,
  ]);
  const background = advanced
    ? (state.backgroundPreview ?? state.features.background)
    : state.features.background;
  const scene = useMemo<ReviewPreviewInputs['scene']>(
    () => ({
      source: state.source,
      canvas: state.features.canvas,
      sourceFilters: state.features.sourceFilters,
      windowHeader: state.features.windowHeader,
      background,
      zoomRegions: state.features.zoomRegions,
      zoomApplied: state.features.zoomApplied,
      zoomTrackVisible: state.features.zoomTrackVisible,
      cursorMotions: state.features.cursorMotions,
      comments: state.snapshot.document.canvasComments,
      annotations: state.snapshot.document.annotations,
      edits: state.snapshot.document.edits,
      overlaysVisible: state.features.overlaysVisible,
      annotationEffects: annotations,
      captions,
      keyCues: state.keyCues,
      clickCues: state.clickCues,
      watermark: advanced ? state.watermark.settings : undefined,
      webcam: state.features.webcam,
      outerFadePlan,
    }),
    [
      state.source,
      state.features.canvas,
      state.features.sourceFilters,
      state.features.windowHeader,
      background,
      state.features.zoomRegions,
      state.features.zoomApplied,
      state.features.zoomTrackVisible,
      state.features.cursorMotions,
      state.snapshot.document.canvasComments,
      state.snapshot.document.annotations,
      state.snapshot.document.edits,
      state.features.overlaysVisible,
      annotations,
      captions,
      state.keyCues,
      state.clickCues,
      advanced,
      state.watermark.settings,
      state.features.webcam,
      outerFadePlan,
    ]
  );
  const seekResultAvailable = state.seekResult !== undefined;
  const cursorPathAvailable = state.setCursorFocusPath !== undefined;
  const cursorKeyAvailable = state.selectCursorFocusKey !== undefined;
  const commands = useMemo<ReviewPreviewInputs['commands']>(
    () => ({
      beforeAction: (action) => latest.current.beforeAction(action),
      play: () => latest.current.play(),
      seek: (time, snap) => latest.current.seek(time, snap),
      seekResult: seekResultAvailable ? (time) => latest.current.seekResult?.(time) : undefined,
      select: (value) => latest.current.setActiveSelection(value),
      dismissFeedback: () => {
        latest.current.setMessage(null);
        latest.current.audio.dismissOriginalFeedback();
      },
      readAsset: async (reference, signal) => {
        signal.throwIfAborted();
        const local = await resource.session.readAnnotationResource(reference, signal);
        signal.throwIfAborted();
        const bytes = local ?? (await resolveReviewAssetBytes(reference));
        signal.throwIfAborted();
        return bytes;
      },
      onCaptionSelect: (id) => {
        const current = latest.current;
        const fragment = current.advanced.text?.fragments.find((item) => item.id === id);
        if (fragment) current.text.jump(fragment, true);
      },
      onRegion: (region) => {
        const current = latest.current;
        if (current.composer.annotation && !current.busy)
          current.composer.change({ ...current.composer.annotation, region });
      },
      onReady: () => {
        const current = latest.current;
        if (current.recovering) return;
        const anchor = current.composer.annotation?.anchor;
        if (anchor) current.seek(anchor.kind === 'point' ? anchor.time : anchor.start);
      },
      onTime: () => {
        const current = latest.current;
        const next = current.onTime();
        if (!current.playing)
          current.setSelection((selection) =>
            selection.kind === 'point' && selection.time !== next
              ? { kind: 'point', time: next }
              : selection
          );
      },
      onPlaying: (playing) => {
        const current = latest.current;
        if (playing && !current.voiceoverSilent)
          current.setActiveSelection((selection) =>
            selection.kind === 'none' ? selection : { kind: 'none' }
          );
        current.onMediaPlayback(playing);
      },
      onMediaReady: (event) => latest.current.onMediaReady?.(event),
      onEnded: () => latest.current.onEnded(),
      onError: () => latest.current.onMediaError(),
      onAssetsReady: () => latest.current.exporter.retryAssetAvailability(),
      setCursorPath: cursorPathAvailable
        ? (path) => latest.current.setCursorFocusPath?.(path)
        : undefined,
      selectCursorKey: cursorKeyAvailable
        ? (id, time) => latest.current.selectCursorFocusKey?.(id, time)
        : undefined,
    }),
    [resource.session, seekResultAvailable, cursorPathAvailable, cursorKeyAvailable]
  );
  const request = useMemo<ReviewPreviewInputs['request']>(
    () => ({
      file: resource.file,
      sourceIdentity: resource.url,
      video: state.video,
      clock: state.playheadClock,
      readPosition: state.readPosition,
      readTimeMap: state.transport?.getTimeMapSnapshot,
      timeMap: state.timeline.timeMap,
      resultDuration: state.timeline.resultDuration,
      seekRevision: state.seekRevision,
      sourceFrameRate: state.exporter.index?.frameRate,
      sourceToResult: (time) => {
        const timeline = latest.current.timeline;
        return timeline.readOutputTime
          ? timeline.readOutputTime(time)
          : timeline.timeMap.sourceToTimeline(time);
      },
    }),
    [
      resource.file,
      resource.url,
      state.video,
      state.playheadClock,
      state.readPosition,
      state.transport,
      state.timeline.timeMap,
      state.timeline.resultDuration,
      state.seekRevision,
      state.exporter.index?.frameRate,
    ]
  );
  const cursorEditable =
    cursorPathAvailable &&
    state.activeSelection?.kind === 'cursor-focus' &&
    advanced &&
    state.features.overlaysVisible &&
    !state.busy &&
    !state.playing &&
    state.editing.exporter.phase === 'idle' &&
    !state.composer.annotation;
  const cursorPath = useMemo(
    () =>
      state.cursorFocusPath ??
      (cursorEditable
        ? resolveReviewCursorFocusPath(
            state.history?.telemetry ?? resource.telemetry ?? null,
            state.source,
            state.advanced.cursorFocusPath
          )
        : undefined),
    [
      state.cursorFocusPath,
      cursorEditable,
      state.history?.telemetry,
      resource.telemetry,
      state.source,
      state.advanced.cursorFocusPath,
    ]
  );
  return {
    scene,
    request,
    commands,
    overlays: {
      advanced,
      selection: state.activeSelection,
      region: state.displayRegion,
      annotation: state.composer.annotation ?? undefined,
      zoom: {
        selected: state.zoom.selected,
        previewRegion: state.zoom.previewRegion,
        preview: state.zoom.preview,
        previewChanges: state.zoom.previewChanges,
        change: state.zoom.change,
        setSelection: state.zoom.setSelection,
      },
      authoredZoom: state.advanced.zoom,
      cursorPath,
      cursorFocusKeys: state.cursorFocusKeys,
      cursorMotion: state.cursorMotion ? { overlay: state.cursorMotion.overlay } : undefined,
      cursorFollow: state.advanced.cursorFocusPath?.mode === 'follow',
      cursorMotionEnabled:
        state.advanced.ui.tracks.cursorMotion !== false &&
        state.advanced.cursorMotionEnabled !== false,
      annotationEditingEnabled: advanced && state.advanced.ui.tracks.annotationEffects !== false,
      annotationEditor: state.annotationEffects,
      annotationSnapshots: effectSnapshots ?? [],
      canvasComments: {
        selectedId: state.canvasComments.selectedId,
        setGeometry: state.canvasComments.setGeometry,
        onSelect: state.canvasComments.onSelect,
        onPatch: state.canvasComments.onPatch,
      },
      webcamEditor: {
        crop: state.webcam.crop,
        place: state.webcam.place,
        placement: state.webcam.placement,
        resourceAttempt: state.webcam.resourceAttempt,
        retry: state.webcam.retry,
        selectVisible: state.webcam.selectVisible,
        selection: state.webcam.selection,
        time: state.webcam.time,
        sourceTime: state.webcam.sourceTime,
      },
      watermark: {
        pending: state.watermark.pending,
        onPreview: state.watermark.preview,
        onChange: state.watermark.change,
        onError: state.watermark.onResourceError,
        retryGeneration: state.watermark.resourceRetryGeneration,
        onReady: commands.onAssetsReady,
      },
    },
    status: {
      busy: state.busy,
      playing: state.playing,
      recovering: state.recovering,
      preparingPlayback: !!state.preparingPlayback,
      exporting: state.editing.exporter.phase !== 'idle',
      message: state.message,
      originalFeedback: state.audio.originalFeedback,
      history: state.history
        ? {
            failed: state.history.failed,
            pending: state.history.pending,
            initialLoading: state.history.initialLoading,
            incomplete: state.history.incomplete,
            retry: state.history.retry,
          }
        : undefined,
      webcam: {
        failed: state.webcam.failed,
        pending: state.webcam.pending,
        retry: state.webcam.retry,
      },
      backgroundPending: state.backgroundImport.pending,
    },
  };
}
