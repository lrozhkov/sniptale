import { evaluateQuickEditSpotlightAtTime } from '../../features/video/review/advanced/focus';
import type { QuickEditZoomRegion } from '../../features/video/review/advanced/types';
import { ReviewStageFocusControl, type ReviewStageFocus } from './stage-focus';
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

/** One stage binding: the applied scene, drawing plane, and overlay comment stack. */
export function ReviewStage(props: {
  backgroundImageUrl?: string | undefined;
  url: string;
  source: ReviewSource;
  video: RefObject<HTMLVideoElement | null>;
  drawing: boolean;
  region: ReviewRegion | undefined;
  /** One scene: applied background and the camera at the represented frame. */
  scene?: ReviewStageScene;
  /** Selected focus controls; disabled during playback and export by the binding. */
  zoom?: ReviewStageFocus;
  comments?: ReviewStageCommentBinding;
  onRegion(value: ReviewRegion): void;
  onReady(): void;
  onTime(time: number): void;
  onPlaying(value: boolean): void;
  onError(): void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const { size, sceneLayout, zoomLayout, backgroundPaint, content, spotlight } =
    useReviewStageGeometry(props, host);
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
          ...(backgroundPaint && props.scene?.background.enabled
            ? {
                background: backgroundPaint,
              }
            : {}),
        }}
        onPointerDown={plane.onPointerDown}
        onPointerMove={plane.onPointerMove}
        onPointerUp={plane.onPointerUp}
        onPointerCancel={plane.onPointerCancel}
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
        <ReviewSceneVideo
          url={props.url}
          video={props.video}
          {...(props.scene ? { scene: props.scene } : {})}
          layout={sceneLayout}
          previewScale={size.width / Math.max(1, props.scene?.canvas?.width ?? props.source.width)}
          drawing={props.drawing}
          projected={projected}
          onReady={props.onReady}
          onTime={props.onTime}
          onPlaying={props.onPlaying}
          onError={props.onError}
        />
        <ReviewSpotlightOverlay output={size} frame={spotlight} />
        {props.comments && props.comments.items.length ? (
          <ReviewStageComments comments={props.comments} output={size} source={props.source} />
        ) : null}
        {props.zoom && zoomLayout ? (
          <ReviewStageFocusControl
            key={props.zoom.region.id}
            focus={props.zoom}
            layout={zoomLayout}
            output={size}
          />
        ) : null}
      </div>
    </div>
  );
}

/** Overlay comment stack using the shared scene geometry. */
function ReviewStageComments(props: {
  comments: ReviewStageCommentBinding;
  output: { width: number; height: number };
  source: ReviewSource;
}) {
  return (
    <ReviewCommentOverlay
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
  url: string;
  video: RefObject<HTMLVideoElement | null>;
  scene?: {
    background: QuickEditBackgroundSettings;
    canvas?: { width: number; height: number } | undefined;
    camera: QuickEditCameraTransform;
  };
  layout: ReturnType<typeof computeQuickEditSceneLayout> | null;
  previewScale: number;
  drawing: boolean;
  projected: ReviewRegion | null;
  onReady(): void;
  onTime(time: number): void;
  onPlaying(value: boolean): void;
  onError(): void;
}) {
  const clip = props.scene?.background.enabled ? props.scene.background.layout : null;
  const translation = props.layout
    ? {
        x: props.layout.videoTransform.x - props.layout.videoRect.x,
        y: props.layout.videoTransform.y - props.layout.videoRect.y,
      }
    : { x: 0, y: 0 };
  const scale = props.scene?.camera.scale ?? 1;
  const videoTransform = `translate3d(${translation.x}px, ${translation.y}px, 0) scale(${scale})`;
  return (
    <div
      style={{
        position: 'absolute',
        left: props.layout?.videoRect.x ?? 0,
        top: props.layout?.videoRect.y ?? 0,
        width: props.layout?.videoRect.width ?? undefined,
        height: props.layout?.videoRect.height ?? undefined,
        overflow: 'hidden',
        borderRadius: clip ? clip.cornerRadius * props.previewScale : undefined,
      }}
    >
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
        onEnded={() => props.onPlaying(false)}
        onError={props.onError}
      />
      {props.projected ? (
        <ReviewRegionOverlay
          drawing={props.drawing}
          offset={
            props.layout
              ? { x: props.layout.videoRect.x, y: props.layout.videoRect.y }
              : { x: 0, y: 0 }
          }
          projected={props.projected}
        />
      ) : null}
    </div>
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
  // Camera motion stays subpixel-smooth and overlays use the same displayed frame bounds.
  return {
    ...layout,
    videoRect,
    videoTransform: computeQuickEditVideoTransform({ videoRect, camera: input.camera }),
  };
}

/** Measures and projects the preview through the same scene model as export. */
function useReviewStageGeometry(
  props: Parameters<typeof ReviewStage>[0],
  host: RefObject<HTMLDivElement | null>
) {
  const viewport = useStageMeasure(host);
  const fitted = fitVideoRect(viewport, props.scene?.canvas ?? props.source);
  const size = snapPreviewRect(fitted);
  const sceneLayout = props.scene
    ? previewSceneLayout({
        output: fitted,
        canvas: props.scene?.canvas,
        source: props.source,
        background: props.scene.background,
        camera: props.scene.camera,
      })
    : null;
  const zoomLayout = props.zoom
    ? previewSceneLayout({
        output: fitted,
        canvas: props.scene?.canvas,
        source: props.source,
        background: props.scene?.background ?? { enabled: false },
        camera: props.zoom.region.spotlight
          ? { scale: 1, centerX: 0.5, centerY: 0.5 }
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
      ? evaluateQuickEditSpotlightAtTime({
          ...props.scene.focus,
          output: size,
          video: sceneLayout.videoRect,
          scale: size.width / Math.max(1, props.scene.canvas?.width ?? props.source.width),
        })
      : null;
  return { size, sceneLayout, zoomLayout, backgroundPaint, content, spotlight };
}
