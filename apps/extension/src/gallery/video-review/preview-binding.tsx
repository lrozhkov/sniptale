import type { ReviewPreviewRendererStatus } from './preview-presentation-state';
import type { ReviewWatermarkEditingAvailability } from './watermark-overlay';
import { useReviewZoomPreview, type useReviewZoomEditor } from './zoom-editor';
import { startTransition, useLayoutEffect, useRef, type ReactNode } from 'react';
import type { ReviewPlaybackPresentationClock } from './playback-presentation-clock';
import type { createReviewTimeMap } from '../../features/video/review/timeline';
import type { QuickEditAdvancedState } from '../../features/video/review/advanced/types';
import type { CursorFocusPath } from '../../features/video/project/cursor-focus-path/types';
import type { CursorFocusTimelineKey } from '../../features/video/project/cursor-focus-path/timeline';
import type { ReviewAnnotation, ReviewSelection } from '../../features/video/review/types';
import type { ReviewBeforeAction } from './note-transitions';
import type { ReviewTransportPosition } from './transport';
import type { QuickPreviewPreferences } from '../../features/video/preview/quick-preferences';
import { translate } from '../../platform/i18n';
import { ReviewButton } from './controls';
import { ReviewFeedback } from './feedback';
import { ReviewPreviewFrame } from './preview-frame';
import { ReviewStageBinding } from './stage-binding';
import { reviewStagePickRegions } from './stage-focus';

type StageProps = Parameters<typeof ReviewStageBinding>[0];
type ZoomCommands = Pick<
  ReturnType<typeof useReviewZoomEditor>,
  'selected' | 'previewRegion' | 'preview' | 'previewChanges' | 'change' | 'setSelection'
>;

/** Composition data changes independently of selection, transport status and inspector navigation. */
type ReviewPreviewScene = Pick<
  StageProps,
  | 'source'
  | 'canvas'
  | 'sourceFilters'
  | 'windowHeader'
  | 'background'
  | 'zoomRegions'
  | 'comments'
  | 'annotations'
  | 'overlaysVisible'
  | 'cursorMotions'
  | 'annotationEffects'
  | 'captions'
  | 'keyCues'
  | 'clickCues'
  | 'outerFadePlan'
> & {
  edits: NonNullable<StageProps['cutPreview']>['edits'];
  watermark: NonNullable<StageProps['watermark']>['settings'];
  webcam: NonNullable<StageProps['webcam']>['settings'] | undefined;
  zoomApplied: boolean;
  zoomTrackVisible: boolean;
};

/** One source/request identity; live position comes from the existing transport authority. */
interface ReviewPreviewRequest {
  file: File;
  sourceIdentity: string;
  video: StageProps['video'];
  clock: ReviewPlaybackPresentationClock;
  readPosition(): ReviewTransportPosition;
  readTimeMap?: (() => import('./transport').ReviewTransportTimeMapSnapshot) | undefined;
  timeMap: ReturnType<typeof createReviewTimeMap>;
  resultDuration: number;
  seekRevision: number;
  sourceFrameRate?: number | undefined;
  sourceToResult(time: number): number | null;
}

/** Editor handles and drafts never become input to the immutable frame plan. */
interface ReviewPreviewOverlays {
  advanced: boolean;
  selection?: ReviewSelection | undefined;
  region: StageProps['region'];
  annotation?: ReviewAnnotation | undefined;
  zoom: ZoomCommands;
  authoredZoom: QuickEditAdvancedState['zoom'];
  cursorPath?: CursorFocusPath | undefined;
  cursorFocusKeys?: readonly CursorFocusTimelineKey[] | undefined;
  cursorMotion?: { overlay?: StageProps['cursorPath'] } | undefined;
  cursorMotionEnabled: boolean;
  cursorFollow: boolean;
  annotationEditingEnabled: boolean;
  annotationEditor?: NonNullable<StageProps['annotationEditing']>['editor'] | undefined;
  annotationSnapshots: NonNullable<StageProps['annotationEditing']>['snapshots'];
  canvasComments: StageProps['canvasComments'];
  webcamEditor: NonNullable<StageProps['webcam']>['editor'];
  watermark: Omit<NonNullable<StageProps['watermark']>, 'settings' | 'output' | 'editable'> & {
    pending: boolean;
  };
}

/** Readiness and feedback are discrete UI facts; they contain no decoded resources or document. */
interface ReviewPreviewStatus {
  busy: boolean;
  playing: boolean;
  recovering: boolean;
  preparingPlayback: boolean;
  exporting: boolean;
  message: string | null;
  originalFeedback: Parameters<typeof ReviewFeedback>[0]['originalFeedback'];
  history?:
    | {
        failed: boolean;
        pending: boolean;
        initialLoading: boolean;
        incomplete: boolean;
        retry(): void;
      }
    | undefined;
  webcam: { failed: boolean; pending: boolean; retry(): void };
  backgroundPending: boolean;
}

/** Commands retain admission and document mutation in the editor's existing owners. */
interface ReviewPreviewCommands {
  beforeAction: ReviewBeforeAction;
  play(): void | Promise<void>;
  seek(time: number, snap?: boolean): void;
  seekResult?: ((time: number) => void) | undefined;
  select(value: ReviewSelection): void;
  dismissFeedback(): void;
  readAsset: NonNullable<StageProps['readAsset']>;
  onCaptionSelect(id: string): void;
  onRegion: StageProps['onRegion'];
  onReady(): void;
  onMediaReady?: StageProps['onMediaReady'];
  onTime(): void;
  onPlaying(playing: boolean): void;
  onEnded(): void;
  onError(): void;
  onAssetsReady(): void;
  setCursorPath?: ((path: CursorFocusPath) => void) | undefined;
  selectCursorKey?: ((id: string | undefined, time: number) => void) | undefined;
}

export interface ReviewPreviewInputs {
  scene: ReviewPreviewScene;
  request: ReviewPreviewRequest;
  overlays: ReviewPreviewOverlays;
  status: ReviewPreviewStatus;
  commands: ReviewPreviewCommands;
}

type PreviewProps = ReviewPreviewInputs & {
  sceneActive: boolean;
  watermarkEditingAvailability?: ReviewWatermarkEditingAvailability | undefined;
  annotationMagnetEnabled?: boolean | undefined;
  previewOverlay?: ReactNode;
  previewPreferences?: QuickPreviewPreferences | undefined;
  onPreviewRendererStatus?: ((status: ReviewPreviewRendererStatus | null) => void) | undefined;
  onPresentedTime?: ((identity: string, resultTime: number) => void) | undefined;
  onPreviewRaster?: ((size: { width: number; height: number } | null) => void) | undefined;
  onOpenPreviewSettings?: ((trigger: HTMLButtonElement) => void) | undefined;
};
type Sample = { sourceTime: number; resultTime: number };
type SurfaceProps = PreviewProps & { sample: Sample };

/** Authored requests and paused controls receive one discrete transport snapshot per parent update. */
export function ReviewPreviewBinding(props: PreviewProps) {
  const previous = useRef<{ source: string; sample: Sample } | null>(null);
  const position = props.request.readPosition();
  const retained =
    previous.current?.source === props.request.sourceIdentity ? previous.current.sample : null;
  const sample: Sample = {
    sourceTime: position.source?.sourceTime ?? position.media?.time ?? retained?.sourceTime ?? 0,
    resultTime: position.resultTime ?? retained?.resultTime ?? 0,
  };
  useLayoutEffect(() => {
    previous.current = { source: props.request.sourceIdentity, sample };
  });
  return <ReviewPreviewContent {...props} sample={sample} />;
}

function ReviewPreviewContent(props: SurfaceProps) {
  const { request, overlays: suppliedOverlays, status, commands } = props;
  const observedZoom = useReviewZoomPreview(suppliedOverlays.zoom);
  const zoom = {
    ...observedZoom,
    previewRegion: (region: Parameters<typeof observedZoom.previewRegion>[0]) => {
      const following =
        !region.border &&
        !region.spotlight &&
        (region.followCursor ?? suppliedOverlays.cursorFollow);
      return observedZoom.previewing && following ? region : observedZoom.previewRegion(region);
    },
  };
  const overlays = { ...suppliedOverlays, zoom };
  const current = { ...props, overlays };
  return (
    <main
      aria-busy={status.recovering || status.preparingPlayback}
      className="flex min-h-0 min-w-0 flex-col overflow-hidden p-3"
    >
      <ReviewPreviewFrame
        onOpenPreviewSettings={props.onOpenPreviewSettings}
        time={props.sample.resultTime}
        clock={request.clock}
        readPosition={request.readPosition}
        duration={request.resultDuration}
        playing={status.playing}
        disabled={status.busy || status.recovering || status.exporting}
        onPlay={() => commands.beforeAction(commands.play)}
        onSeek={(value) =>
          commands.beforeAction(() => {
            if (commands.seekResult) {
              commands.select({ kind: 'none' });
              commands.seekResult(value);
              return;
            }
            const source = request.timeMap.timelineToSource(value);
            if (source !== null) {
              commands.select({ kind: 'none' });
              commands.seek(source, false);
            }
          })
        }
      >
        {(fullscreen) => (
          <>
            <ReviewPreviewStage
              {...current}
              fullscreen={fullscreen}
              focusInteracting={zoom.previewing}
            />
            {status.history?.failed || status.webcam.failed ? (
              <div
                data-ui="gallery.videoReview.previewNotices"
                className="absolute inset-x-0 top-0 z-40 flex max-h-full flex-col gap-2 overflow-y-auto
                  border-b border-[var(--sniptale-color-border-soft)]
                  bg-[var(--sniptale-color-surface-panel-glass)] p-3 text-sm
                  text-[var(--sniptale-color-text-primary)] shadow-[var(--sniptale-shadow-sm)]
                  backdrop-blur-[var(--sniptale-glass-blur)]"
              >
                {status.history?.failed ? (
                  <div role="alert" className="flex items-center gap-3">
                    <span className="min-w-0 flex-1">
                      {translate('gallery.videoReview.recordingHistoryFailed')}
                    </span>
                    <ReviewButton
                      label={translate('gallery.videoReview.retry')}
                      onClick={status.history.retry}
                    />
                  </div>
                ) : null}
                {status.webcam.failed ? (
                  <div role="alert" className="flex items-center gap-3">
                    <span className="min-w-0 flex-1">
                      {translate('gallery.videoReview.webcamFailed')}
                    </span>
                    <ReviewButton
                      label={translate('gallery.videoReview.retry')}
                      onClick={status.webcam.retry}
                    />
                  </div>
                ) : null}
              </div>
            ) : null}
            <ReviewFeedback
              message={status.message}
              originalFeedback={status.originalFeedback}
              onDismiss={commands.dismissFeedback}
            />
          </>
        )}
      </ReviewPreviewFrame>
    </main>
  );
}

function ReviewPreviewStage(
  props: SurfaceProps & { fullscreen: boolean; focusInteracting: boolean }
) {
  const { scene, request, overlays, status, commands, sample } = props;
  const sceneAvailable = !status.playing && !status.exporting && !overlays.annotation;
  const sceneEditable = sceneAvailable && !status.busy;
  return (
    <ReviewStageBinding
      previewOverlay={props.previewOverlay}
      captions={scene.captions}
      onCaptionSelect={commands.onCaptionSelect}
      cursorMotions={scene.cursorMotions}
      cursorPath={
        sceneEditable &&
        overlays.advanced &&
        overlays.cursorMotionEnabled &&
        overlays.selection?.kind === 'cursor-motion'
          ? overlays.cursorMotion?.overlay
          : cursorPathOverlay(props, sceneEditable)
      }
      annotationEffects={scene.annotationEffects}
      onAnnotationGeometry={overlays.annotationEditor?.setGeometry}
      annotationEditing={
        overlays.annotationEditor &&
        overlays.annotationEditingEnabled &&
        sceneAvailable &&
        scene.overlaysVisible
          ? {
              magnetEnabled: props.annotationMagnetEnabled ?? false,
              editor: overlays.annotationEditor,
              selectedId:
                overlays.selection?.kind === 'annotation-effect' ? overlays.selection.id : null,
              snapshots: overlays.annotationSnapshots,
              segments: request.timeMap.getSegments(),
              time: sample.resultTime,
              busy: status.busy,
              beforeAction: commands.beforeAction,
              onSelect: (id) => commands.select({ kind: 'annotation-effect', id }),
            }
          : undefined
      }
      readAsset={commands.readAsset}
      outerFadePlan={scene.outerFadePlan}
      preview={
        props.previewPreferences
          ? {
              preferences: props.previewPreferences,
              playing: status.playing,
              onPresentedTime: props.onPresentedTime,
              interacting: props.focusInteracting,
              sourceToResult: request.sourceToResult,
              readPosition: request.readPosition,
              seekRevision: request.seekRevision,
              onRaster: props.onPreviewRaster,
              onRendererStatus: props.onPreviewRendererStatus,
              sourceFrameRate: request.sourceFrameRate,
              waitingReason:
                [
                  status.preparingPlayback ? translate('gallery.videoReview.audioPreparing') : null,
                  status.history?.pending || status.history?.initialLoading
                    ? translate('gallery.videoReview.recordingHistoryLoading')
                    : null,
                  status.webcam.pending ? translate('gallery.videoReview.webcamLoading') : null,
                  status.recovering || status.backgroundPending
                    ? translate('gallery.videoReview.previewLoading')
                    : null,
                ]
                  .filter(Boolean)
                  .join('\n') || undefined,
            }
          : undefined
      }
      watermark={
        overlays.advanced
          ? {
              ...overlays.watermark,
              settings: scene.watermark,
              editable: props.sceneActive && sceneEditable && !overlays.watermark.pending,
              editingAvailability: props.watermarkEditingAvailability,
            }
          : undefined
      }
      keyCues={scene.keyCues}
      clickCues={scene.clickCues}
      webcam={
        scene.webcam && !status.webcam.pending
          ? {
              settings: scene.webcam,
              editor: overlays.webcamEditor,
              onResourceReady: commands.onAssetsReady,
              disabled: !sceneEditable,
            }
          : undefined
      }
      cutPreview={{
        readTimeMap: request.readTimeMap,
        file: request.file,
        duration: scene.source.duration,
        edits: scene.edits,
        time: sample.resultTime,
      }}
      backgroundPending={status.backgroundPending}
      url={request.sourceIdentity}
      source={scene.source}
      canvas={scene.canvas}
      sourceFilters={scene.sourceFilters}
      windowHeader={scene.windowHeader}
      video={request.video}
      drawing={!!overlays.annotation && !status.playing && !status.busy}
      region={overlays.region}
      zoomRegions={scene.zoomRegions}
      background={scene.background}
      outputTime={sample.resultTime}
      zoomOverlay={focusOverlay(props)}
      focusTimeMap={request.timeMap.getSegments()}
      focusPicker={fullscreenFocus(props, props.fullscreen && sceneEditable)}
      comments={scene.comments}
      annotations={scene.annotations}
      canvasComments={overlays.canvasComments}
      overlaysVisible={scene.overlaysVisible}
      time={request.timeMap.timelineToSource(sample.resultTime) ?? sample.sourceTime}
      busy={status.busy}
      onRegion={commands.onRegion}
      onReady={commands.onReady}
      onMediaReady={commands.onMediaReady}
      onTime={() => startTransition(commands.onTime)}
      onPlaying={commands.onPlaying}
      onEnded={commands.onEnded}
      onError={commands.onError}
    />
  );
}

function focusOverlay({ scene, request, overlays, status, commands }: SurfaceProps) {
  const region = scene.zoomTrackVisible ? overlays.zoom.selected(overlays.authoredZoom) : null;
  if (!region || status.busy || status.playing || status.exporting) return undefined;
  return {
    region: overlays.zoom.previewRegion(region),
    onPreview: (patch: Parameters<typeof overlays.zoom.preview>[1]) =>
      overlays.zoom.preview(region.id, patch),
    onChange: (patch: Parameters<typeof overlays.zoom.change>[1]) =>
      overlays.zoom.change(region.id, patch),
    onInteract: () => {
      const time = request.timeMap.timelineToSource((region.start + region.end) / 2);
      if (time !== null) commands.seek(time, false);
    },
  };
}

function fullscreenFocus(
  { scene, request, overlays, commands, sample }: SurfaceProps,
  enabled: boolean
) {
  if (!enabled || !scene.zoomApplied) return undefined;
  return {
    regions: reviewStagePickRegions(
      overlays.authoredZoom.regions,
      request.timeMap.getSegments(),
      sample.resultTime
    ),
    onSelect: (id: string) => {
      const region = overlays.authoredZoom.regions.find((item) => item.id === id);
      if (!region) return;
      overlays.zoom.setSelection(id);
      const time = request.timeMap.timelineToSource((region.start + region.end) / 2);
      if (time !== null) commands.seek(time, false);
    },
  };
}

function cursorPathOverlay({ scene, overlays, commands, sample }: SurfaceProps, editable: boolean) {
  return commands.setCursorPath &&
    overlays.cursorPath &&
    editable &&
    overlays.selection?.kind === 'cursor-focus' &&
    overlays.advanced &&
    scene.overlaysVisible
    ? {
        path: overlays.cursorPath,
        time: sample.sourceTime,
        recordedKey: overlays.cursorFocusKeys?.find(
          (key) => overlays.selection?.kind === 'cursor-focus' && key.id === overlays.selection.id
        ),
        selectedKeyId: overlays.selection.id,
        ...(commands.selectCursorKey ? { onSelect: commands.selectCursorKey } : {}),
        onChange: commands.setCursorPath,
        onSeek: (time: number) => commands.seek(time, false),
      }
    : undefined;
}
