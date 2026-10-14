import { ReviewSceneVideo, ReviewRegionOverlay } from './stage-video';
import { ReviewCursorPathOverlay } from './cursor-path-overlay';
import {
  ReviewAnnotationOverlay,
  type ReviewAnnotationEditing,
} from './annotation-effects-overlay';
import {
  presentationMainColorOpacity,
  presentationMainColor,
  type PresentationSequencePlan,
} from '../../features/video/review/presentation-sequence';
import {
  useStagePresentation,
  ReviewStagePresentationFeedback,
  ReviewHeaderFailure,
} from './stage-presentation';
import type { QuickPreviewPreferences } from '../../features/video/preview/quick-preferences';
import {
  useReviewStageGeometry,
  resolveReviewClickRaster,
  type ReviewStageScene,
  type ReviewStageCommentGeometry,
} from './stage-geometry';
import { ReviewWatermarkOverlay } from './watermark-overlay';
import { ReviewKeyOverlay } from './key-animation-overlay';
import { ReviewStageBackground } from './background-blur-preview';
import {
  quickEditPlaneProjection,
  quickEditProjectionCss,
  invertQuickEditProjection,
} from '../../features/video/review/advanced/spatial-geometry';
import { ReviewClickOverlay } from './click-animation-overlay';
import type { ReviewClickCue } from '../../features/video/review/click-animation';
import { ReviewMotionBlurPreview } from './motion-blur-preview';
import { ReviewBorderOverlay } from './border-overlay';
import { ReviewWebcamOverlay, type ReviewWebcamStageBinding } from './webcam-overlay';
import { useReviewWindowHeader } from './use-window-header';
import {
  ReviewCutBlackout,
  type ReviewCutPreviewBinding,
  type ReviewCutPreviewRaster,
} from './cut-transition-preview';
import {
  ReviewStageFocusControl,
  ReviewStageFocusTargets,
  type ReviewStageFocus,
  type ReviewStageFocusPicker,
} from './stage-focus';
import { ReviewSpotlightOverlay } from './spotlight-overlay';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { projectVideoRegion } from '../../features/video/review/geometry';
import type {
  CanvasComment,
  ReviewAnnotation,
  ReviewRegion,
  ReviewSource,
} from '../../features/video/review/types';
import {
  type computeQuickEditSceneLayout,
  computeQuickEditSpatialWindow,
  computeQuickEditSceneSize,
  computeQuickEditSourceWindowTransform,
  computeQuickEditSceneCamera,
} from '../../features/video/review/advanced/scene';
import type {
  QuickEditBackgroundSettings,
  QuickEditCameraTransform,
} from '../../features/video/review/advanced/types';
import { ReviewCommentOverlay } from './comment-overlay';
import { useReviewDrawingPlane } from './stage-drawing';

type ReviewStageCommentBinding = {
  items: readonly CanvasComment[];
  annotations: readonly ReviewAnnotation[];
  time: number;
  background: QuickEditBackgroundSettings;
  camera: QuickEditCameraTransform | null;
  selectedId: string | null;
  busy: boolean;
  onSelect(id: string): void;
  onMove(id: string, position: { x: number; y: number }): void;
  /** Reports the stage geometry for attachment switching; null hides overlays. */
  onGeometry?(geometry: ReviewStageCommentGeometry): void;
};

type ReviewStageProps = {
  cursorPath?: Omit<Parameters<typeof ReviewCursorPathOverlay>[0], 'width' | 'height'> | undefined;
  annotationEditing?: ReviewAnnotationEditing | undefined;
  onAnnotationGeometry?: ReviewAnnotationEditing['editor']['setGeometry'] | undefined;
  captions?: Parameters<typeof useStagePresentation>[0]['captions'];
  annotationEffects?: Parameters<typeof useStagePresentation>[0]['annotationEffects'];
  readAsset?: Parameters<typeof useStagePresentation>[0]['readAsset'];
  onCaptionSelect?: ((id: string) => void) | undefined;
  preview?:
    | {
        preferences: QuickPreviewPreferences;
        playing: boolean;
        sourceToResult(time: number): number | null;
        onRaster?: ((size: { width: number; height: number } | null) => void) | undefined;
        sourceFrameRate?: number | undefined;
      }
    | undefined;
  outerFadePlan?: PresentationSequencePlan | undefined;
  watermark?: Omit<Parameters<typeof ReviewWatermarkOverlay>[0], 'output'> | undefined;
  keyCues?: readonly import('../../features/video/review/key-animation').ReviewKeyCue[] | undefined;
  clickCues?: readonly ReviewClickCue[] | undefined;
  webcam?: ReviewWebcamStageBinding | undefined;
  backgroundImageUrl?: string | undefined;
  cutPreview?: ReviewCutPreviewBinding | undefined;
  onCutRaster?: ((raster: ReviewCutPreviewRaster) => void) | undefined;
  url: string;
  source: ReviewSource;
  video: RefObject<HTMLVideoElement | null>;
  drawing: boolean;
  region: ReviewRegion | undefined;
  /** One scene: applied background and the camera at the represented frame. */
  scene?: ReviewStageScene;
  /** Selected focus controls; disabled during playback and export by the binding. */
  zoom?: ReviewStageFocus;
  focusPicker?: ReviewStageFocusPicker | undefined;
  comments?: ReviewStageCommentBinding;
  onRegion(value: ReviewRegion): void;
  onReady(): void;
  onTime(time: number): void;
  onPlaying(value: boolean): void;
  onEnded?: (() => void) | undefined;
  onError(): void;
};

/** Keep native header geometry and pointer inversion aligned with the authored scene. */
function useStageInteractionGeometry(
  props: Pick<ReviewStageProps, 'source' | 'scene' | 'drawing' | 'region' | 'onRegion' | 'video'>,
  geometry: Pick<ReturnType<typeof useReviewStageGeometry>, 'sceneLayout' | 'content'>,
  manual: boolean
) {
  const { sceneLayout, content } = geometry;
  // Match the SVG viewport to the fitted header allocation, including its rounded toolbar rows.
  // A source-rounded SVG in a differently shaped img box otherwise gains internal letterboxing.
  const headerDisplayHeight = sceneLayout
    ? Math.round(
        ((((sceneLayout.visibleVideoRect ?? sceneLayout.videoRect).y - sceneLayout.windowRect.y) *
          props.source.width) /
          (sceneLayout.visibleVideoRect ?? sceneLayout.videoRect).width) *
          1e6
      ) / 1e6
    : undefined;
  const header = useReviewWindowHeader(
    manual ? undefined : props.scene?.windowHeader,
    props.source.width,
    props.source.height,
    headerDisplayHeight
  );
  const motion =
    sceneLayout && props.scene
      ? computeQuickEditSceneCamera(sceneLayout, props.scene.background)
      : { x: 0, y: 0, scale: 1, backgroundScale: 1 };
  const window = sceneLayout
    ? computeQuickEditSpatialWindow(sceneLayout, props.scene?.background ?? { enabled: false })
    : null;
  const projection =
    sceneLayout?.spatial && window
      ? quickEditPlaneProjection(window, window, sceneLayout.spatial)
      : undefined;
  const plane = useReviewDrawingPlane({
    crop: sceneLayout?.sourceCrop,
    inverseProjection: projection
      ? (invertQuickEditProjection(projection) ?? undefined)
      : undefined,
    drawing: props.drawing,
    content,
    region: props.region,
    onRegion: props.onRegion,
    pause: () => props.video.current?.pause(),
  });
  const projected = plane.drag
    ? projectVideoRegion(plane.drag, content)
    : props.region
      ? projectVideoRegion(props.region, content)
      : null;
  return { header, motion, projection, plane, projected };
}

/** One stage binding: the applied scene, drawing plane, and overlay comment stack. */
export function ReviewStage(props: ReviewStageProps) {
  const host = useRef<HTMLDivElement>(null);
  const publication = useRef<HTMLDivElement>(null);
  const [cutRaster, setCutRaster] = useState<ReviewCutPreviewRaster>({
    active: false,
    frame: null,
  });
  const {
    size,
    watermarkOutput,
    annotationGeometry,
    sceneLayout,
    zoomLayout,
    backgroundPaint,
    content,
    spotlight,
    borders,
    overlayClip,
  } = useReviewStageGeometry(props, host);
  useAnnotationGeometryReport(props, annotationGeometry);
  const { presentation, beginInteraction } = useStagePresentation(
    props,
    publication,
    watermarkOutput,
    size
  );
  const manual = presentation.active;
  const { header, motion, projection, plane, projected } = useStageInteractionGeometry(
    props,
    { sceneLayout, content },
    manual
  );
  return (
    <div
      ref={host}
      data-ui="gallery.videoReview.workspaceSurface"
      style={{
        backgroundColor:
          'var(--sniptale-review-workspace-color, var(--sniptale-color-surface-canvas))',
      }}
      onPointerDownCapture={beginInteraction}
      className={[
        'relative min-h-36 flex-1 overflow-hidden rounded-[var(--sniptale-radius-sm)]',
        'bg-[var(--sniptale-color-surface-canvas)]',
      ].join(' ')}
    >
      <ReviewHeaderFailure failed={!manual && header.failed} retry={header.retry} />
      <div
        data-ui="gallery.videoReview.stage"
        className="absolute overflow-hidden bg-black"
        style={{
          left: size.x,
          top: size.y,
          width: size.width,
          height: size.height,
          cursor: props.drawing ? 'crosshair' : 'default',
          touchAction: props.drawing ? 'none' : 'auto',
        }}
        onPointerDown={plane.onPointerDown}
        onPointerMove={plane.onPointerMove}
        onPointerUp={plane.onPointerUp}
        onPointerCancel={plane.onPointerCancel}
      >
        <ReviewStageFrame
          props={props}
          geometry={{ sceneLayout, size, backgroundPaint, spotlight, overlayClip }}
          manual={manual}
          header={header}
          motion={motion}
          projection={projection}
          projected={projected}
          publication={publication}
          onCutRaster={setCutRaster}
          getFrame={() => (cutRaster.active ? cutRaster.frame : props.video.current)}
        />
        {manual && projected && !sceneLayout?.spatial ? (
          <ReviewRegionOverlay
            drawing={props.drawing}
            projected={projected}
            offset={{ x: 0, y: 0 }}
          />
        ) : null}
        <ReviewStageContent
          manual={manual}
          headerImage={header.image}
          onCommentPreview={presentation.onCommentPreview}
          getFrame={() => (cutRaster.active ? cutRaster.frame : props.video.current)}
          props={props}
          geometry={{ size, sceneLayout, zoomLayout, borders, overlayClip }}
          projection={projection}
          projected={projected}
        />
        <ReviewStageComments
          comments={props.comments}
          attachment="viewport"
          visualMode={manual ? 'handles' : undefined}
          onPreviewPosition={presentation.onCommentPreview}
          output={size}
          source={props.source}
          layout={sceneLayout}
        />
        {props.webcam ? (
          <ReviewWebcamOverlay
            binding={props.webcam}
            main={props.video}
            output={size}
            manual={manual ? presentation.webcamManual : undefined}
            onPreviewPlacement={presentation.onWebcamPreview}
          />
        ) : null}
        {!manual ? (
          <ReviewKeyOverlay
            cues={props.keyCues}
            time={props.scene?.focus?.time ?? 0}
            output={size}
          />
        ) : null}
        {props.watermark && (
          <ReviewWatermarkOverlay
            {...props.watermark}
            output={watermarkOutput}
            manual={manual ? presentation.watermarkManual : undefined}
          />
        )}
        {!manual ? (
          <>
            <ReviewCutBlackout binding={props.cutPreview} />
            <ReviewStageOuterFade plan={props.outerFadePlan} time={props.scene?.focus?.time ?? 0} />
          </>
        ) : null}
        {props.annotationEditing && annotationGeometry && (
          <ReviewAnnotationOverlay
            binding={props.annotationEditing}
            geometry={annotationGeometry}
            size={size}
          />
        )}
        <ReviewStagePresentationFeedback
          presentation={presentation}
          showFrameRate={props.preview?.preferences.showFrameRate ?? false}
          captions={props.captions}
          onCaptionSelect={props.onCaptionSelect}
        />
      </div>
    </div>
  );
}

/** Native composition uses the same global envelope as the final manual fill. */
function ReviewStageOuterFade({
  plan,
  time,
}: {
  plan: PresentationSequencePlan | undefined;
  time: number;
}) {
  if (!plan) return null;
  return (
    <div
      data-ui="gallery.videoReview.outerFade"
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-40"
      style={{
        backgroundColor: presentationMainColor(plan, time),
        opacity: presentationMainColorOpacity(plan, time),
      }}
    />
  );
}

/** Native and published base pixels share geometry before sharp content and editing overlays. */
function ReviewStageFrame({
  props,
  geometry,
  manual,
  header,
  motion,
  projection,
  projected,
  publication,
  onCutRaster,
  getFrame,
}: {
  props: ReviewStageProps;
  geometry: Pick<
    ReturnType<typeof useReviewStageGeometry>,
    'sceneLayout' | 'size' | 'backgroundPaint' | 'spotlight' | 'overlayClip'
  >;
  manual: boolean;
  header: ReturnType<typeof useReviewWindowHeader>;
  motion: ReturnType<typeof useStageInteractionGeometry>['motion'];
  projection: ReturnType<typeof useStageInteractionGeometry>['projection'];
  projected: ReturnType<typeof useStageInteractionGeometry>['projected'];
  publication: RefObject<HTMLDivElement | null>;
  onCutRaster(value: ReviewCutPreviewRaster): void;
  getFrame(): CanvasImageSource | null;
}) {
  const { sceneLayout, size, backgroundPaint, spotlight, overlayClip } = geometry;
  return (
    <>
      {!manual ? (
        <ReviewStageBackground
          {...reviewBackgroundPlaneProps(props)}
          motion={motion}
          paint={backgroundPaint}
        />
      ) : null}
      <ReviewSceneVideo
        manual={manual}
        url={props.url}
        cutPreview={props.cutPreview}
        onCutRaster={onCutRaster}
        video={props.video}
        {...(props.scene ? { scene: props.scene } : {})}
        layout={sceneLayout}
        header={header}
        previewScale={size.width / Math.max(1, props.scene?.canvas?.width ?? props.source.width)}
        drawing={props.drawing}
        projected={projected}
        onReady={props.onReady}
        onTime={props.onTime}
        onPlaying={props.onPlaying}
        onEnded={props.onEnded}
        onError={props.onError}
      />
      {!manual ? (
        <ReviewStageNativeEffects
          props={props}
          geometry={{ sceneLayout, size, spotlight, overlayClip }}
          headerImage={header.image}
          projection={projection}
          getFrame={getFrame}
        />
      ) : null}
      <div
        ref={publication}
        data-ui="gallery.videoReview.manualPreview"
        className="pointer-events-none absolute inset-0"
        style={{ display: manual ? undefined : 'none' }}
      />
    </>
  );
}

/** Native-only optical effects consume the same frame and clip as the scene. */
function ReviewStageNativeEffects({
  props,
  geometry,
  headerImage,
  projection,
  getFrame,
}: {
  props: Pick<ReviewStageProps, 'drawing' | 'scene' | 'backgroundImageUrl' | 'source'>;
  geometry: Pick<
    ReturnType<typeof useReviewStageGeometry>,
    'sceneLayout' | 'size' | 'spotlight' | 'overlayClip'
  >;
  headerImage: ReturnType<typeof useReviewWindowHeader>['image'];
  projection: Parameters<typeof ReviewSpotlightOverlay>[0]['projection'];
  getFrame(): CanvasImageSource | null;
}) {
  const { sceneLayout, size, spotlight, overlayClip } = geometry;
  return (
    <>
      {(!props.drawing || sceneLayout?.spatial) && props.scene && sceneLayout ? (
        <ReviewMotionBlurPreview
          scene={{ ...props.scene, source: props.source }}
          focus={props.scene.focus}
          camera={props.scene.camera}
          layout={sceneLayout}
          output={size}
          background={props.scene.background}
          imageUrl={props.backgroundImageUrl}
          headerImage={headerImage}
          sceneScale={size.width / Math.max(1, props.scene.canvas?.width ?? props.source.width)}
          getFrame={getFrame}
        />
      ) : null}
      <ReviewSpotlightOverlay
        projection={projection}
        output={size}
        frames={spotlight}
        clip={overlayClip}
      />
    </>
  );
}

/** Sharp content overlays and interaction targets share one projected plane. */
function ReviewStageContent({
  manual,
  headerImage,
  onCommentPreview,
  getFrame,
  props,
  geometry,
  projection,
  projected,
}: {
  manual: boolean;
  headerImage: ReturnType<typeof useReviewWindowHeader>['image'];
  onCommentPreview: ReturnType<typeof useStagePresentation>['presentation']['onCommentPreview'];
  getFrame(): CanvasImageSource | null;
  props: ReviewStageProps;
  geometry: Pick<
    ReturnType<typeof useReviewStageGeometry>,
    'size' | 'sceneLayout' | 'zoomLayout' | 'borders' | 'overlayClip'
  >;
  projection:
    | import('../../features/video/review/advanced/spatial-geometry').QuickEditHomography
    | undefined;
  projected: ReturnType<typeof projectVideoRegion> | null;
}) {
  const { size, sceneLayout, zoomLayout, borders, overlayClip } = geometry;
  const clickRaster =
    sceneLayout && props.scene && overlayClip
      ? resolveReviewClickRaster(sceneLayout, props.scene.background, overlayClip)
      : undefined;
  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={
        projection
          ? { transformOrigin: '0 0', transform: quickEditProjectionCss(projection) }
          : undefined
      }
    >
      {sceneLayout?.spatial && projected ? (
        <ReviewRegionOverlay
          drawing={props.drawing}
          projected={projected}
          offset={{ x: 0, y: 0 }}
        />
      ) : null}
      {!manual ? <ReviewBorderOverlay output={size} frames={borders} clip={overlayClip} /> : null}
      {!manual ? (
        <ReviewClickOverlay
          getFrame={getFrame}
          cues={props.clickCues}
          time={props.scene?.focus?.time ?? 0}
          output={size}
          video={clickRaster?.video}
          sourceWidth={props.source.width}
          headerImage={headerImage}
          window={clickRaster?.window}
          clip={clickRaster?.clip}
          transform={clickRaster?.transform}
        />
      ) : null}
      <ReviewStageComments
        comments={props.comments}
        attachment="content"
        visualMode={manual ? 'handles' : undefined}
        onPreviewPosition={onCommentPreview}
        clip={projection || sceneLayout?.sourceCrop ? overlayClip : undefined}
        projection={projection}
        output={size}
        source={props.source}
        layout={sceneLayout}
      />
      {props.focusPicker && sceneLayout ? (
        <ReviewStageFocusTargets
          picker={props.focusPicker}
          clip={overlayClip}
          output={size}
          selectedId={props.zoom?.region.id}
          video={computeQuickEditSourceWindowTransform(sceneLayout)}
        />
      ) : null}
      {props.cursorPath && sceneLayout && !projection ? (
        <div
          className="pointer-events-none absolute"
          style={{
            left: sceneLayout.videoTransform.x,
            top: sceneLayout.videoTransform.y,
            width: sceneLayout.videoTransform.width,
            height: sceneLayout.videoTransform.height,
            clipPath: sceneLayout.sourceCrop
              ? `inset(${[
                  sceneLayout.sourceCrop.y,
                  1 - sceneLayout.sourceCrop.x - sceneLayout.sourceCrop.width,
                  1 - sceneLayout.sourceCrop.y - sceneLayout.sourceCrop.height,
                  sceneLayout.sourceCrop.x,
                ]
                  .map((value) => `${value * 100}%`)
                  .join(' ')})`
              : undefined,
          }}
        >
          <ReviewCursorPathOverlay
            {...props.cursorPath}
            width={props.source.width}
            height={props.source.height}
            displayWidth={sceneLayout.videoTransform.width}
            bounds={{
              left: -sceneLayout.videoTransform.x / sceneLayout.videoTransform.width,
              top: -sceneLayout.videoTransform.y / sceneLayout.videoTransform.height,
              right: (size.width - sceneLayout.videoTransform.x) / sceneLayout.videoTransform.width,
              bottom:
                (size.height - sceneLayout.videoTransform.y) / sceneLayout.videoTransform.height,
            }}
          />
        </div>
      ) : null}
      {props.zoom && zoomLayout ? (
        <ReviewStageFocusControl
          scene={props.scene ? { ...props.scene, source: props.source } : undefined}
          projection={projection}
          key={props.zoom.region.id}
          focus={props.zoom}
          behindTargets={!!props.focusPicker}
          layout={zoomLayout}
          output={size}
        />
      ) : null}
    </div>
  );
}

/** Overlay comment stack using the shared scene geometry. */
function ReviewStageComments(props: {
  visualMode?: 'handles' | undefined;
  onPreviewPosition?: Parameters<typeof ReviewCommentOverlay>[0]['onPreviewPosition'];
  clip?: Parameters<typeof ReviewCommentOverlay>[0]['clip'];
  attachment: CanvasComment['attachment'];
  projection?:
    | import('../../features/video/review/advanced/spatial-geometry').QuickEditHomography
    | undefined;
  comments: ReviewStageCommentBinding | undefined;
  layout: ReturnType<typeof computeQuickEditSceneLayout> | null;
  output: { width: number; height: number };
  source: ReviewSource;
}) {
  if (!props.comments?.items.length) return null;
  return (
    <ReviewCommentOverlay
      visualMode={props.visualMode}
      onPreviewPosition={props.onPreviewPosition}
      clip={props.clip}
      projection={props.projection}
      layout={props.layout ?? undefined}
      comments={props.comments.items.filter((c) => c.attachment === props.attachment)}
      annotations={props.comments.annotations}
      output={props.output}
      source={props.source}
      background={props.comments.background}
      camera={props.comments.camera}
      time={props.comments.time}
      selectedId={props.comments.selectedId}
      busy={props.comments.busy}
      onSelect={props.comments.onSelect}
      onMove={props.comments.onMove}
    />
  );
}

function reviewBackgroundPlaneProps(props: ReviewStageProps) {
  return {
    background: props.scene?.background,
    sceneSize: props.scene
      ? computeQuickEditSceneSize({ ...props.scene, source: props.source })
      : props.source,
    imageUrl: props.backgroundImageUrl,
  };
}

function useAnnotationGeometryReport(
  props: ReviewStageProps,
  annotationGeometry: ReturnType<typeof useReviewStageGeometry>['annotationGeometry']
) {
  const reportAnnotationGeometry =
    props.onAnnotationGeometry ?? props.annotationEditing?.editor.setGeometry;
  useEffect(() => {
    reportAnnotationGeometry?.(annotationGeometry);
  }, [annotationGeometry, reportAnnotationGeometry]);
}
