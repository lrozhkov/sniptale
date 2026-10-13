import { resolveReviewCursorFocusPath } from '../../features/video/review/advanced/cursor-focus-path';
import { useMemo } from 'react';
import { buildReviewTimeMap } from '../../features/video/review/timeline';
import { planReviewPresentationSequence } from '../../features/video/review/presentation-sequence';
import { resolveReviewOutputProfile } from '../../workflows/video-review/render-settings';
import { resolveReviewAssetBytes } from '../../workflows/video-review/asset-bytes';
import type { QuickPreviewPreferences } from '../../features/video/preview/quick-preferences';
import { translate } from '../../platform/i18n';
import { ReviewButton } from './controls';
import { ReviewFeedback } from './feedback';
import { ReviewPreviewFrame } from './preview-frame';
import { ReviewStageBinding } from './stage-binding';
import { reviewStagePickRegions } from './stage-focus';
import type { LoadedReview } from './use-session';
import type { useReviewEditorState } from './use-editor-state';

type EditorState = ReturnType<typeof useReviewEditorState>;
type StageProps = Parameters<typeof ReviewStageBinding>[0];
type PreviewState = Pick<
  EditorState,
  | 'busy'
  | 'playing'
  | 'voiceoverSilent'
  | 'time'
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
  | 'setPlaying'
  | 'onEnded'
  | 'onMediaError'
  | 'recovering'
> & {
  setCursorFocusPath?: EditorState['setCursorFocusPath'];
  selectCursorFocusKey?: EditorState['selectCursorFocusKey'];
  cursorFocusPath?: EditorState['cursorFocusPath'];
  annotationEffects?: EditorState['annotationEffects'];
  activeSelection?: EditorState['activeSelection'];
  text: Pick<EditorState['text'], 'jump'>;
  features: Pick<
    EditorState['features'],
    | 'webcam'
    | 'canvas'
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
  timeline: Pick<EditorState['timeline'], 'sceneOutputTime' | 'resultDuration' | 'timeMap'>;
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
    'selected' | 'previewRegion' | 'preview' | 'change' | 'setSelection'
  >;
};

/** Preview layout, feedback and stage events share one visible-area binding. */
export function ReviewPreviewBinding({
  resource,
  state,
  sceneActive,
  previewPreferences,
  onPreviewRaster,
  onOpenPreviewSettings,
}: {
  resource: Pick<LoadedReview, 'file' | 'url' | 'session'> &
    Partial<Pick<LoadedReview, 'telemetry'>>;
  state: PreviewState;
  sceneActive: boolean;
  previewPreferences?: QuickPreviewPreferences | undefined;
  onPreviewRaster?: ((size: { width: number; height: number } | null) => void) | undefined;
  onOpenPreviewSettings?: ((trigger: HTMLButtonElement) => void) | undefined;
}) {
  const { busy, audio } = state;
  return (
    <main
      aria-busy={state.recovering}
      className="flex min-h-0 min-w-0 flex-col overflow-hidden p-3"
    >
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
        onOpenPreviewSettings={onOpenPreviewSettings}
        time={state.timeline.sceneOutputTime}
        duration={state.timeline.resultDuration}
        playing={state.playing}
        disabled={busy || state.recovering || state.editing.exporter.phase !== 'idle'}
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
          <ReviewPreviewStage
            resource={resource}
            state={state}
            sceneActive={sceneActive}
            fullscreen={fullscreen}
            previewPreferences={previewPreferences}
            onPreviewRaster={onPreviewRaster}
          />
        )}
      </ReviewPreviewFrame>
    </main>
  );
}

/** Caption clock/selection adaptation is independent of scene drag/edit controls. */
function useReviewCaptionPreview(
  state: Pick<PreviewState, 'advanced' | 'source' | 'snapshot' | 'text'>
) {
  const captionSegments = useMemo(
    () => buildReviewTimeMap(state.source.duration, state.snapshot.document.edits),
    [state.source.duration, state.snapshot.document.edits]
  );
  const captions =
    state.advanced.ui.mode === 'advanced' && state.advanced.captions?.enabled
      ? {
          document: state.advanced.text,
          settings: state.advanced.captions,
          segments: captionSegments,
        }
      : undefined;
  return {
    captions,
    onCaptionSelect(id: string) {
      const fragment = state.advanced.text?.fragments.find((entry) => entry.id === id);
      if (fragment) state.text.jump(fragment, true);
    },
  };
}

/** Stage interactions share playback admission and disposable scene gestures. */
function ReviewPreviewStage({
  resource,
  state,
  sceneActive,
  fullscreen,
  previewPreferences,
  onPreviewRaster,
}: {
  resource: Pick<LoadedReview, 'file' | 'url' | 'session'> &
    Partial<Pick<LoadedReview, 'telemetry'>>;
  state: PreviewState;
  sceneActive: boolean;
  fullscreen: boolean;
  previewPreferences?: QuickPreviewPreferences | undefined;
  onPreviewRaster?: ((size: { width: number; height: number } | null) => void) | undefined;
}) {
  const { busy, features, composer, snapshot, canvasComments } = state;
  const captionPreview = useReviewCaptionPreview(state);
  const outerFadePlan = useReviewOuterFadePlan(state);
  const sceneEditable =
    !state.playing && !busy && state.editing.exporter.phase === 'idle' && !composer.annotation;
  return (
    <ReviewStageBinding
      {...captionPreview}
      cursorPath={reviewCursorPathOverlayBinding(state, resource.telemetry, sceneEditable)}
      annotationEffects={
        features.annotationEffects
          ? {
              lane: state.annotationEffects?.previewLane ?? features.annotationEffects,
              snapshots: resource.session.getSnapshot().snapshot.workspace.effectSnapshots ?? [],
              segments: state.timeline.timeMap.getSegments(),
            }
          : undefined
      }
      onAnnotationGeometry={state.annotationEffects?.setGeometry}
      annotationEditing={
        state.annotationEffects &&
        state.advanced.ui.mode === 'advanced' &&
        state.advanced.ui.tracks.annotationEffects !== false &&
        sceneEditable &&
        features.overlaysVisible
          ? {
              editor: state.annotationEffects,
              selectedId:
                state.activeSelection?.kind === 'annotation-effect'
                  ? state.activeSelection.id
                  : null,
              snapshots: resource.session.getSnapshot().snapshot.workspace.effectSnapshots ?? [],
              segments: state.timeline.timeMap.getSegments(),
              time: state.timeline.sceneOutputTime,
              busy,
              beforeAction: state.beforeAction,
              onSelect: (id) => state.setActiveSelection({ kind: 'annotation-effect', id }),
            }
          : undefined
      }
      readAsset={async (reference, signal) => {
        signal.throwIfAborted();
        const local = await resource.session.readAnnotationResource(reference, signal);
        signal.throwIfAborted();
        const bytes = local ?? (await resolveReviewAssetBytes(reference));
        signal.throwIfAborted();
        return bytes;
      }}
      outerFadePlan={outerFadePlan}
      preview={
        previewPreferences
          ? {
              preferences: previewPreferences,
              playing: state.playing,
              sourceToResult: state.timeline.timeMap.sourceToTimeline,
              onRaster: onPreviewRaster,
              sourceFrameRate: state.exporter.index?.frameRate,
            }
          : undefined
      }
      watermark={
        state.advanced.ui.mode === 'advanced'
          ? {
              settings: state.watermark.settings,
              editable: sceneActive && sceneEditable && !state.watermark.pending,
              onPreview: state.watermark.preview,
              onChange: state.watermark.change,
              onError: state.watermark.onResourceError,
              retryGeneration: state.watermark.resourceRetryGeneration,
              onReady: state.exporter.retryAssetAvailability,
            }
          : undefined
      }
      keyCues={state.keyCues}
      clickCues={state.clickCues}
      webcam={
        features.webcam && !state.webcam.pending
          ? {
              settings: features.webcam,
              editor: state.webcam,
              onResourceReady: state.exporter.retryAssetAvailability,
              disabled: !sceneEditable,
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
      background={
        state.advanced.ui.mode === 'advanced'
          ? (state.backgroundPreview ?? features.background)
          : features.background
      }
      outputTime={state.timeline.sceneOutputTime}
      zoomOverlay={reviewFocusOverlay(state)}
      focusTimeMap={state.timeline.timeMap.getSegments()}
      focusPicker={reviewFullscreenFocus(state, fullscreen && sceneEditable)}
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
        if (state.recovering) return;
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
        if (playing && !state.voiceoverSilent)
          state.setActiveSelection((current) =>
            current.kind === 'none' ? current : { kind: 'none' }
          );
        state.setPlaying(playing);
      }}
      onEnded={() => state.beforeAction(state.onEnded)}
      onError={state.onMediaError}
    />
  );
}

/** The selected focus shares one edit transaction between the inspector and the stage. */
function reviewFocusOverlay(state: PreviewState) {
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

/** Fullscreen selection seeks the authored focus midpoint through the current cut map. */
function reviewFullscreenFocus(state: PreviewState, enabled: boolean) {
  if (!enabled || !state.features.zoomApplied) return undefined;
  return {
    regions: reviewStagePickRegions(
      state.advanced.zoom.regions,
      state.timeline.timeMap.getSegments(),
      state.timeline.sceneOutputTime
    ),
    onSelect: (id: string) => {
      const region = state.advanced.zoom.regions.find((item) => item.id === id);
      if (!region) return;
      state.zoom.setSelection(id);
      const sourceTime = state.timeline.timeMap.timelineToSource((region.start + region.end) / 2);
      if (sourceTime !== null) state.seek(sourceTime, false);
    },
  };
}

function reviewCursorPathOverlayBinding(
  state: PreviewState,
  telemetry: LoadedReview['telemetry'] | undefined,
  sceneEditable: boolean
) {
  return state.setCursorFocusPath &&
    sceneEditable &&
    state.activeSelection?.kind === 'cursor-focus' &&
    state.advanced.ui.mode === 'advanced' &&
    state.features.overlaysVisible
    ? {
        path:
          state.cursorFocusPath ??
          resolveReviewCursorFocusPath(
            telemetry ?? null,
            state.source,
            state.advanced.cursorFocusPath
          ),
        time: state.time,
        ...(state.activeSelection?.kind === 'cursor-focus'
          ? { selectedKeyId: state.activeSelection.id }
          : {}),
        ...(state.selectCursorFocusKey ? { onSelect: state.selectCursorFocusKey } : {}),
        onChange: state.setCursorFocusPath,
        onSeek: (time: number) => state.seek(time, false),
      }
    : undefined;
}

function useReviewOuterFadePlan(state: PreviewState) {
  const outerFadePlan = useMemo(() => {
    if (state.advanced.ui.mode !== 'advanced' || !state.exporter.index) return undefined;
    try {
      const profile = resolveReviewOutputProfile(
        state.exporter.index,
        state.advanced,
        state.exporter.renderSettings
      );
      if (!profile.dimensionsSupported) return undefined;
      const result = planReviewPresentationSequence({
        settings: state.presentation.settings,
        mainDuration: state.timeline.resultDuration,
        fragmentOffset: 0,
        includeBookends: true,
        rate: profile.rate,
      });
      return result.ok ? result.plan : undefined;
    } catch {
      return undefined;
    }
  }, [
    state.advanced,
    state.exporter.index,
    state.exporter.renderSettings,
    state.presentation.settings,
    state.timeline.resultDuration,
  ]);
  return outerFadePlan;
}
