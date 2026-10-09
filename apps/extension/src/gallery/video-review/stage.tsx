import {
  presentationMainColorOpacity,
  presentationMainColor,
  type PresentationSequencePlan,
} from '../../features/video/review/presentation-sequence';
import { useStagePresentation, ReviewStagePresentationFeedback } from './stage-presentation';
import type { QuickPreviewPreferences } from '../../features/video/preview/quick-preferences';
import {
  useReviewStageGeometry,
  resolveReviewClickRaster,
  type ReviewStageScene,
  type ReviewStageCommentGeometry,
} from './stage-geometry';
import { ReviewWatermarkOverlay } from './watermark-overlay';
import { ReviewKeyOverlay } from './key-animation-overlay';
import { ReviewBackgroundBlurPreview } from './background-blur-preview';
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
import { resolveQuickEditShadow } from '../../features/video/review/advanced/shadow';
import { ReviewButton } from './controls';
import { useReviewWindowHeader } from './use-window-header';
import {
  ReviewCutTransitionPreview,
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
import { useRef, useState, type RefObject } from 'react';
import { translate } from '../../platform/i18n';
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
  computeQuickEditWindowTransform,
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
  preview?:
    | {
        preferences: QuickPreviewPreferences;
        playing: boolean;
        sourceToResult(time: number): number | null;
        onRaster?: ((size: { width: number; height: number } | null) => void) | undefined;
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
        (((sceneLayout.videoRect.y - sceneLayout.windowRect.y) * props.source.width) /
          sceneLayout.videoRect.width) *
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
    sceneLayout,
    zoomLayout,
    backgroundPaint,
    content,
    spotlight,
    borders,
    overlayClip,
  } = useReviewStageGeometry(props, host);
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
      onPointerDownCapture={(event) => {
        if (event.button === 0) beginInteraction();
      }}
      className="relative min-h-36 flex-1 overflow-hidden rounded-[var(--sniptale-radius-sm)]
          bg-[var(--sniptale-color-surface-canvas)]"
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
        {!manual ? (
          <ReviewStageBackground props={props} motion={motion} paint={backgroundPaint} />
        ) : null}
        <ReviewSceneVideo
          manual={manual}
          url={props.url}
          cutPreview={props.cutPreview}
          onCutRaster={setCutRaster}
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
            getFrame={() => (cutRaster.active ? cutRaster.frame : props.video.current)}
          />
        ) : null}
        <div
          ref={publication}
          data-ui="gallery.videoReview.manualPreview"
          className="pointer-events-none absolute inset-0"
          style={{ display: manual ? undefined : 'none' }}
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
        <ReviewStagePresentationFeedback
          presentation={presentation}
          showFrameRate={props.preview?.preferences.showFrameRate ?? false}
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
  onCommentPreview,
  getFrame,
  props,
  geometry,
  projection,
  projected,
}: {
  manual: boolean;
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
          clip={clickRaster?.clip}
          transform={clickRaster?.transform}
        />
      ) : null}
      <ReviewStageComments
        comments={props.comments}
        attachment="content"
        visualMode={manual ? 'handles' : undefined}
        onPreviewPosition={onCommentPreview}
        clip={projection ? overlayClip : undefined}
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
          video={computeQuickEditWindowTransform(sceneLayout)}
        />
      ) : null}
      {props.zoom && zoomLayout ? (
        <ReviewStageFocusControl
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

/** One composition-space video: fitted inside the padded content rect, cropped by the clip. */
function ReviewSceneVideo(props: {
  manual: boolean;
  cutPreview?: ReviewCutPreviewBinding | undefined;
  onCutRaster?: ((raster: ReviewCutPreviewRaster) => void) | undefined;
  url: string;
  video: RefObject<HTMLVideoElement | null>;
  scene?: {
    background: QuickEditBackgroundSettings;
    canvas?: { width: number; height: number } | undefined;
    windowHeader?:
      | import('../../features/video/review/advanced/types').QuickEditWindowHeader
      | undefined;
    camera: QuickEditCameraTransform;
  };
  layout: ReturnType<typeof computeQuickEditSceneLayout> | null;
  previewScale: number;
  header: ReturnType<typeof useReviewWindowHeader>;
  drawing: boolean;
  projected: ReviewRegion | null;
  onReady(): void;
  onTime(time: number): void;
  onPlaying(value: boolean): void;
  onEnded?: (() => void) | undefined;
  onError(): void;
}) {
  const clip = props.scene?.background.enabled ? props.scene.background.layout : null;
  const motion =
    props.layout && props.scene
      ? computeQuickEditSceneCamera(props.layout, props.scene.background)
      : null;
  const shadow = resolveQuickEditShadow(
    props.scene?.background ?? { enabled: false },
    props.previewScale * (motion?.scale ?? 1)
  );
  const videoClip = motion?.windowClip ?? props.layout?.windowRect;
  const translation = props.layout
    ? {
        x: props.layout.videoTransform.x - (videoClip?.x ?? 0),
        y: props.layout.videoTransform.y - (videoClip?.y ?? 0),
      }
    : { x: 0, y: 0 };
  const scale = props.scene?.camera.scale ?? 1;
  const videoTransform = `translate3d(${translation.x}px, ${translation.y}px, 0) scale(${scale})`;
  return (
    <div
      style={{
        position: 'absolute',
        opacity: props.manual ? 0 : undefined,
        pointerEvents: props.manual ? 'none' : undefined,
        left: videoClip?.x ?? 0,
        top: videoClip?.y ?? 0,
        width: videoClip?.width ?? undefined,
        height: videoClip?.height ?? undefined,
        overflow: 'hidden',
        boxShadow: shadow
          ? `0 0 ${shadow.blur}px color-mix(in srgb, ${shadow.color} ${shadow.opacity * 100}%, transparent)`
          : undefined,
        borderRadius: clip
          ? clip.cornerRadius * props.previewScale * (motion?.scale ?? 1)
          : undefined,
      }}
    >
      <ReviewWindowHeader header={props.header} layout={props.layout} transform={videoTransform} />
      <video
        ref={props.video}
        src={props.url}
        controls={false}
        playsInline
        preload="metadata"
        className="pointer-events-none"
        style={
          props.layout
            ? {
                position: 'absolute',
                left: 0,
                top: 0,
                width: props.layout.videoRect.width,
                height: props.layout.videoRect.height,
                transformOrigin: '0 0',
                transform: videoTransform,
                maxWidth: 'none',
                // Scene geometry already fits the source; native contain can leave a raster seam.
                objectFit: 'fill',
                pointerEvents: 'none',
              }
            : {
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                pointerEvents: 'none',
              }
        }
        onLoadedMetadata={props.onReady}
        onTimeUpdate={(event) => props.onTime(event.currentTarget.currentTime)}
        onPlay={() => props.onPlaying(true)}
        onPause={() => props.onPlaying(false)}
        onEnded={() => (props.onEnded ? props.onEnded() : props.onPlaying(false))}
        onError={props.onError}
      />
      {!props.manual && props.cutPreview && props.layout ? (
        <ReviewCutTransitionPreview
          binding={props.cutPreview}
          onRaster={props.onCutRaster}
          video={props.video}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: props.layout.videoRect.width,
            height: props.layout.videoRect.height,
            transformOrigin: '0 0',
            transform: videoTransform,
            maxWidth: 'none',
          }}
        />
      ) : null}
      {props.projected ? (
        <ReviewRegionOverlay
          drawing={props.drawing}
          offset={props.layout ? { x: videoClip?.x ?? 0, y: videoClip?.y ?? 0 } : { x: 0, y: 0 }}
          projected={props.projected}
        />
      ) : null}
    </div>
  );
}

/** Artwork and its opaque join ride the same transform as the native video. */
function ReviewWindowHeader({
  header,
  layout,
  transform,
}: {
  header: ReturnType<typeof useReviewWindowHeader>;
  layout: ReturnType<typeof computeQuickEditSceneLayout> | null;
  transform: string;
}) {
  if (!header.image || !layout) return null;
  const common = {
    position: 'absolute' as const,
    left: 0,
    top: 0,
    width: layout.videoRect.width,
    transformOrigin: '0 0',
    pointerEvents: 'none' as const,
  };
  return (
    <>
      {/* Back both sides of the join; independently antialiased textures can otherwise expose the scene. */}
      <div
        style={{
          ...common,
          height: 2,
          background: header.joinColor,
          transform: `${transform} translateY(-1px)`,
        }}
      />
      <img
        alt=""
        src={header.url ?? undefined}
        draggable={false}
        style={{
          ...common,
          height: layout.videoRect.y - layout.windowRect.y,
          // Layout-sized zooming rounds each edge separately and rerasterizes the SVG each frame.
          transform: `${transform} translateY(-100%)`,
          maxWidth: 'none',
        }}
      />
    </>
  );
}

function ReviewRegionOverlay(props: {
  drawing: boolean;
  offset: { x: number; y: number };
  projected: ReviewRegion;
}) {
  return (
    <div
      aria-label={translate('gallery.videoReview.selectedRegion')}
      className={`${props.drawing ? 'cursor-move' : 'pointer-events-none'}
          absolute border-2 border-[var(--sniptale-color-accent)]
          bg-[color:color-mix(in_srgb,var(--sniptale-color-accent)_12%,transparent)]`}
      style={{
        left: props.projected.x - props.offset.x,
        top: props.projected.y - props.offset.y,
        width: props.projected.width,
        height: props.projected.height,
      }}
    >
      {props.drawing
        ? (['nw', 'ne', 'sw', 'se'] as const).map((corner) => (
            <span
              key={corner}
              data-region-corner={corner}
              className="absolute h-2.5 w-2.5 rounded-sm border border-[var(--sniptale-color-accent)]
                  bg-[var(--sniptale-color-surface-panel)]"
              style={{
                left: corner.endsWith('w') ? -5 : undefined,
                right: corner.endsWith('e') ? -5 : undefined,
                top: corner.startsWith('n') ? -5 : undefined,
                bottom: corner.startsWith('s') ? -5 : undefined,
                cursor: corner === 'nw' || corner === 'se' ? 'nwse-resize' : 'nesw-resize',
              }}
            />
          ))
        : null}
    </div>
  );
}

/** Header loading has its own recoverable notice above the rendered scene. */
function ReviewHeaderFailure(props: { failed: boolean; retry(): void }) {
  if (!props.failed) return null;
  return (
    <div
      role="alert"
      className="absolute inset-x-0 top-0 z-20 flex items-center gap-2
        bg-[var(--sniptale-color-surface-panel)] p-2 text-xs"
    >
      <span>{translate('gallery.videoReview.windowHeaderFailed')}</span>
      <ReviewButton label={translate('gallery.videoReview.retry')} onClick={props.retry} />
    </div>
  );
}

/** Background moves as its own scene plane, below all content overlays. */
function ReviewStageBackground({
  props,
  motion,
  paint,
}: {
  props: ReviewStageProps;
  motion: { x: number; y: number; backgroundScale: number };
  paint: string | null;
}) {
  const background = props.scene?.background;
  const blurred =
    background?.enabled && background.type !== 'solid' && (background.layout.blur ?? 0) > 0;
  const sceneSize = props.scene
    ? computeQuickEditSceneSize({ ...props.scene, source: props.source })
    : props.source;
  return (
    <div
      data-ui="gallery.videoReview.backgroundPlane"
      className="pointer-events-none absolute inset-0"
      style={{
        background: paint ?? undefined,
        transformOrigin: '0 0',
        transform: `translate3d(${motion.x}px, ${motion.y}px, 0) scale(${motion.backgroundScale})`,
      }}
    >
      {blurred ? (
        <ReviewBackgroundBlurPreview
          background={background}
          imageUrl={props.backgroundImageUrl}
          width={sceneSize.width}
          height={sceneSize.height}
        />
      ) : props.backgroundImageUrl &&
        props.scene?.background.enabled &&
        props.scene.background.type === 'image' ? (
        <img
          src={props.backgroundImageUrl}
          alt=""
          className="pointer-events-none absolute inset-0 h-full w-full"
          style={{ objectFit: props.scene.background.imageFit }}
        />
      ) : null}
    </div>
  );
}
