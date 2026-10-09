import {
  useReviewInspectorNavigation,
  reviewTimelineInspectorCommands,
} from './inspector-navigation';
import { useReviewAudioWiring } from './voiceover-recording';
import { ReviewInspectorBinding, reviewInspectorContext } from './inspector-binding';
import { usePresentationPreview } from './use-presentation-preview';
import { ReviewEditorPresentationDialog } from './presentation-preview-dialog';
import { resolveReviewAssetBytes } from '../../workflows/video-review/asset-bytes';
import { resolveOverlayComments } from '../../features/video/review/comments';
import { ReviewPreviewInspector } from './preview-inspector';
import { useReviewPreviewPreferences } from './use-preview-preferences';
import { useReviewMusicImport } from './music-import';
import { MusicLibraryDrawer } from './music-library';
import { ReviewPanelResizeHandle, useReviewPanelLayout } from './panel-layout';
import { ReviewPreviewBinding } from './preview-binding';
import { ReviewLoadStatus, reviewErrorMessage } from './feedback';
import { ReviewDialog } from './review-dialog';
import { ReviewHistoryControls } from './timeline-chrome';
import { reviewSelectionLabel } from './selected-properties';
import { useMemo, useState } from 'react';
import { translate, useAppLocale } from '../../platform/i18n';
import { ReviewButton } from './controls';
import { useReviewWaveforms } from './audio-waveform';
import { ReviewTimelineBinding } from './timeline-binding';
import { useLoadedReview, type LoadedReview } from './use-session';
import { ReviewVoiceoverLayer } from './voiceover-panel';
import { useReviewEditorState } from './use-editor-state';

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

type ReviewEditorProps = {
  onJoinPreview?: ((slot: 'intro' | 'outro', target?: 'fade' | 'join') => void) | undefined;
  resource: LoadedReview;
  onBack(): void;
  onClose(): void;
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
          }
        : null,
    [
      resource.file,
      editing.exporter.index,
      snapshot.document,
      advanced,
      editing.exporter.renderSettings,
      features.overlaysVisible,
      state.clickCues,
      state.keyCues,
    ]
  );
  return usePresentationPreview(previewInput, preferences, () => state.video.current?.pause());
}

/** Localize prepared window choices without adding scene/export policy to the workspace shell. */
function ReviewEditor({ resource, onBack, onClose, onJoinPreview }: ReviewEditorProps) {
  const state = useReviewEditorState(resource);
  const previewPreferences = useReviewPreviewPreferences();
  const [previewRaster, setPreviewRaster] = useState<{ width: number; height: number } | null>(
    null
  );
  const [fullHeight, setFullHeight] = useState(false);
  const [selectedSpeechId, setSelectedSpeechId] = useState<string>();
  const panelsEnabled = state.advanced.ui.mode === 'advanced';
  const panels = useReviewPanelLayout(panelsEnabled);
  const { navigation, requestExport } = useReviewEditorNavigation(state);
  const { onImportAudioFile, voiceover } = useReviewAudioWiring(state);
  const music = useReviewMusicImport(state);
  const { audio, canvasComments, editing, snapshot, composer, advanced, features, zoom, busy } =
    state;
  const joinPreview = useEditorPresentationPreview(resource, state, previewPreferences.preferences);

  const waveforms = useReviewWaveforms(
    resource.file,
    state.source.duration,
    { voiceover: features.voiceover, music: features.music },
    features.mode === 'advanced' || !!editing.exporter.index?.audioCodec,
    editing.exporter.index === null || !!editing.exporter.index.audioCodec
  );
  return (
    <>
      <ReviewEditorPresentationDialog preview={joinPreview} />
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
          <ReviewPreviewBinding
            onOpenPreviewSettings={navigation.openPreview}
            previewPreferences={previewPreferences.preferences}
            onPreviewRaster={setPreviewRaster}
            resource={resource}
            state={state}
            sceneActive={navigation.shown === 'scene'}
          />
          <ReviewInspectorBinding
            selectedSpeechId={navigation.shown === 'speech' ? selectedSpeechId : undefined}
            onJoinPreview={onJoinPreview ?? joinPreview.open}
            preview={
              <ReviewPreviewInspector
                preferences={previewPreferences.preferences}
                status={previewPreferences.status}
                actualRaster={previewRaster}
                onChange={previewPreferences.change}
                onReset={previewPreferences.reset}
                onRetry={previewPreferences.retry}
              />
            }
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
              text={state.text}
              {...reviewTimelineInspectorCommands({
                video: state.video,
                select: state.setActiveSelection,
                seek: state.seek,
                navigation,
                selectedTextId: state.text.selectedId,
                selectedSpeechId,
                setSpeechId: setSelectedSpeechId,
                requestExport,
              })}
              webcam={state.webcam}
              fillHeight={panels.timelineHeight !== null}
              playbackRange={state.playbackRange}
              onPlaybackRange={state.setPlaybackRange}
              zoomAnchor={state.zoomAnchor}
              beforeAction={state.beforeAction}
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
              playing={state.playing}
              markers={state.telemetry ? state.projected.markers : []}
              selectedTelemetryRef={
                state.activeSelection.kind === 'telemetry' ? state.activeSelection.ref : undefined
              }
              zoom={zoom}
              audio={audio}
              audioState={advanced.audio}
              automaticOriginalRanges={features.automaticOriginalRanges}
              waveforms={waveforms}
              onImportAudioFile={(...args) => state.beforeAction(() => onImportAudioFile(...args))}
              onRecordVoiceover={() => state.beforeAction(voiceover.open)}
              onOpenMusic={music.open}
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
      {music.drawer && <MusicLibraryDrawer {...music.drawer} />}
    </>
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
  const { resource, failed, retry } = useLoadedReview(aggregateId);
  return (
    <ReviewDialog>
      {resource ? (
        <ReviewEditor
          resource={resource}
          onBack={onBack}
          onClose={onClose}
          onJoinPreview={onJoinPreview}
        />
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

/** Inspector navigation owns selection context and explicit export requests. */
function useReviewEditorNavigation(state: ReturnType<typeof useReviewEditorState>) {
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
  return { navigation, requestExport };
}
