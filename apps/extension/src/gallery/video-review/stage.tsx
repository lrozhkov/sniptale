import { EXACT_BROWSER_FRAME_TOKENS } from '../../features/browser-frame/assets';
import { evaluateQuickEditBordersAtTime } from '../../features/video/review/advanced/border';
import { ReviewBorderOverlay } from './border-overlay';
import { ReviewWebcamOverlay, type ReviewWebcamStageBinding } from './webcam-overlay';
import { resolveQuickEditShadow } from '../../features/video/review/advanced/shadow';
import { ReviewButton } from './controls';
import { useReviewWindowHeader } from './use-window-header';
import { ReviewCutTransitionPreview, type ReviewCutPreviewBinding } from './cut-transition-preview';
import { evaluateQuickEditSpotlightsAtTime } from '../../features/video/review/advanced/focus';
import type { QuickEditZoomRegion } from '../../features/video/review/advanced/types';
import {
  ReviewStageFocusControl,
  ReviewStageFocusTargets,
  type ReviewStageFocus,
  type ReviewStageFocusPicker,
} from './stage-focus';
import { ReviewSpotlightOverlay } from './spotlight-overlay';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { translate } from '../../platform/i18n';
import { fitVideoRect, projectVideoRegion } from '../../features/video/review/geometry';
import { serializePaintToCss } from '@sniptale/foundation/paint';
import type {
  CanvasComment,
  ReviewAnnotation,
  ReviewRegion,
  ReviewSource,
} from '../../features/video/review/types';
import {
  computeQuickEditSceneLayout,
  computeQuickEditSceneSize,
  computeQuickEditWindowTransform,
  computeQuickEditSceneCamera,
  computeQuickEditVideoTransform,
} from '../../features/video/review/advanced/scene';
import type {
  QuickEditBackgroundSettings,
  QuickEditCameraTransform,
} from '../../features/video/review/advanced/types';
import { ReviewCommentOverlay } from './comment-overlay';
import { useReviewDrawingPlane } from './stage-drawing';

type ReviewStageScene = {
  background: QuickEditBackgroundSettings;
  canvas?: { width: number; height: number } | undefined;
  windowHeader?:
    | import('../../features/video/review/advanced/types').QuickEditWindowHeader
    | undefined;
  camera: QuickEditCameraTransform;
  focus?: { regions: readonly QuickEditZoomRegion[]; time: number };
};

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
  onGeometry?(geometry: {
    output: { width: number; height: number };
    videoTransform: { x: number; y: number; width: number; height: number } | null;
  }): void;
};

/** Stage pixels: the host box measured once and on every resize. */
function useStageMeasure(host: RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState({ width: 1, height: 1 });
  useEffect(() => {
    const node = host.current;
    if (!node) return;
    const measure = () =>
      setSize({ width: Math.max(1, node.clientWidth), height: Math.max(1, node.clientHeight) });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [host]);
  return size;
}

type ReviewStageProps = {
  webcam?: ReviewWebcamStageBinding | undefined;
  backgroundImageUrl?: string | undefined;
  cutPreview?: ReviewCutPreviewBinding | undefined;
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

/** One stage binding: the applied scene, drawing plane, and overlay comment stack. */
export function ReviewStage(props: ReviewStageProps) {
  const host = useRef<HTMLDivElement>(null);
  const header = useReviewWindowHeader(props.scene?.windowHeader, props.source.width);
  const {
    size,
    sceneLayout,
    zoomLayout,
    backgroundPaint,
    content,
    spotlight,
    borders,
    overlayClip,
  } = useReviewStageGeometry(props, host);
  const motion =
    sceneLayout && props.scene
      ? computeQuickEditSceneCamera(sceneLayout, props.scene.background)
      : { x: 0, y: 0, scale: 1 };
  const plane = useReviewDrawingPlane({
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
  return (
    <div
      ref={host}
      className="relative min-h-36 flex-1 overflow-hidden rounded-[var(--sniptale-radius-sm)]
          bg-[var(--sniptale-color-surface-canvas)]"
    >
      {header.failed ? (
        <div
          role="alert"
          className="absolute inset-x-0 top-0 z-20 flex items-center gap-2
            bg-[var(--sniptale-color-surface-panel)] p-2 text-xs"
        >
          <span>{translate('gallery.videoReview.windowHeaderFailed')}</span>
          <ReviewButton label={translate('gallery.videoReview.retry')} onClick={header.retry} />
        </div>
      ) : null}
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
        <div
          data-ui="gallery.videoReview.backgroundPlane"
          className="pointer-events-none absolute inset-0"
          style={{
            background: backgroundPaint ?? undefined,
            transformOrigin: '0 0',
            transform: `translate3d(${motion.x}px, ${motion.y}px, 0) scale(${motion.scale})`,
          }}
        >
          {props.backgroundImageUrl &&
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
        <ReviewSceneVideo
          url={props.url}
          cutPreview={props.cutPreview}
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
        <ReviewSpotlightOverlay output={size} frames={spotlight} clip={overlayClip} />
        <ReviewBorderOverlay output={size} frames={borders} clip={overlayClip} />
        {props.comments && props.comments.items.length ? (
          <ReviewStageComments
            comments={props.comments}
            output={size}
            source={props.source}
            layout={sceneLayout}
          />
        ) : null}
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
            key={props.zoom.region.id}
            focus={props.zoom}
            behindTargets={!!props.focusPicker}
            layout={zoomLayout}
            output={size}
          />
        ) : null}
        {props.webcam ? (
          <ReviewWebcamOverlay binding={props.webcam} main={props.video} output={size} />
        ) : null}
      </div>
    </div>
  );
}

/** Overlay comment stack using the shared scene geometry. */
function ReviewStageComments(props: {
  comments: ReviewStageCommentBinding;
  layout: ReturnType<typeof computeQuickEditSceneLayout> | null;
  output: { width: number; height: number };
  source: ReviewSource;
}) {
  return (
    <ReviewCommentOverlay
      layout={props.layout ?? undefined}
      comments={props.comments.items}
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
  cutPreview?: ReviewCutPreviewBinding | undefined;
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
      {props.cutPreview && props.layout ? (
        <ReviewCutTransitionPreview
          binding={props.cutPreview}
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
          background: EXACT_BROWSER_FRAME_TOKENS.bodyFill,
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

function backgroundPaintOf(background: {
  type: 'solid' | 'gradient' | 'image';
  color?: string;
  gradient?: import('@sniptale/foundation/paint').Gradient;
}): string {
  if (background.type === 'solid' && background.color) return background.color;
  if (background.type === 'gradient' && background.gradient)
    return serializePaintToCss({ kind: 'gradient', gradient: background.gradient });
  return '#000000';
}

/** Align the stationary raster bounds; fractional video boxes expose the black stage edge. */
function snapPreviewRect(rect: ReviewRegion): ReviewRegion {
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.max(1, Math.round(rect.width)),
    height: Math.max(1, Math.round(rect.height)),
  };
}

function previewSceneLayout(input: Parameters<typeof computeQuickEditSceneLayout>[0]) {
  const layout = computeQuickEditSceneLayout(input);
  const videoRect = snapPreviewRect(layout.videoRect);
  const windowRect = {
    ...videoRect,
    y: Math.round(layout.windowRect.y),
    height: videoRect.height + videoRect.y - Math.round(layout.windowRect.y),
  };
  // Camera motion stays subpixel-smooth and overlays use the same displayed frame bounds.
  return {
    ...layout,
    videoRect,
    windowRect,
    videoTransform: computeQuickEditVideoTransform({ videoRect, windowRect, camera: input.camera }),
  };
}

/** Measures and projects the preview through the same scene model as export. */
function useReviewStageGeometry(
  props: Parameters<typeof ReviewStage>[0],
  host: RefObject<HTMLDivElement | null>
) {
  const viewport = useStageMeasure(host);
  const sceneSize = props.scene
    ? computeQuickEditSceneSize({ ...props.scene, source: props.source })
    : props.source;
  const fitted = fitVideoRect(viewport, sceneSize);
  const size = snapPreviewRect(fitted);
  const sceneLayout = props.scene
    ? previewSceneLayout({
        output: fitted,
        canvas: props.scene?.canvas,
        windowHeader: props.scene?.windowHeader,
        source: props.source,
        background: props.scene.background,
        camera: props.scene.camera,
      })
    : null;
  const zoomLayout = props.zoom
    ? previewSceneLayout({
        output: fitted,
        canvas: props.scene?.canvas,
        windowHeader: props.scene?.windowHeader,
        source: props.source,
        background: props.scene?.background ?? { enabled: false },
        camera:
          props.zoom.region.spotlight || props.zoom.region.border
            ? (props.scene?.camera ?? { scale: 1, centerX: 0.5, centerY: 0.5 })
            : props.zoom.region.transform,
      })
    : null;
  const backgroundPaint = props.scene?.background.enabled
    ? backgroundPaintOf(props.scene.background)
    : null;
  // Drawing maps into the represented pixels, so the post-camera rect is authoritative.
  const content = sceneLayout ? sceneLayout.videoTransform : fitVideoRect(size, props.source);
  const reportGeometry = props.comments?.onGeometry;
  useEffect(() => {
    if (reportGeometry && sceneLayout)
      reportGeometry({
        output: size,
        videoTransform: sceneLayout.videoTransform,
      });
  }, [size, sceneLayout, reportGeometry]);
  const spotlight =
    sceneLayout && props.scene?.focus
      ? evaluateQuickEditSpotlightsAtTime({
          ...props.scene.focus,
          output: size,
          video: computeQuickEditWindowTransform(sceneLayout),
          scale:
            (size.width / Math.max(1, props.scene.canvas?.width ?? props.source.width)) *
            props.scene.camera.scale,
        })
      : [];
  const borders =
    sceneLayout && props.scene?.focus
      ? evaluateQuickEditBordersAtTime({
          ...props.scene.focus,
          output: size,
          video: computeQuickEditWindowTransform(sceneLayout),
          scale:
            (size.width / Math.max(1, props.scene.canvas?.width ?? props.source.width)) *
            props.scene.camera.scale,
        })
      : [];
  const overlayClip =
    sceneLayout && props.scene
      ? {
          rect: computeQuickEditSceneCamera(sceneLayout, props.scene.background).windowClip,
          radius: props.scene.background.enabled
            ? ((props.scene.background.layout.cornerRadius * size.width) /
                Math.max(1, props.scene.canvas?.width ?? props.source.width)) *
              computeQuickEditSceneCamera(sceneLayout, props.scene.background).scale
            : 0,
        }
      : undefined;
  return {
    size,
    sceneLayout,
    zoomLayout,
    backgroundPaint,
    content,
    spotlight,
    borders,
    overlayClip,
  };
}
