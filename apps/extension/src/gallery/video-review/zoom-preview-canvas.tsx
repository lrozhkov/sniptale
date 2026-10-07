import { ReviewButton } from './controls';
import { quickEditPlaneProjection } from '../../features/video/review/advanced/spatial-geometry';
import { createReviewSpatialRenderer } from '../../workflows/video-review/spatial-renderer';
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { ReviewFocusFrame, useFocusFrameHover } from './focus-area-frame';
import { useReviewCameraGesture } from './camera-gesture';
import { translate } from '../../platform/i18n';
import type {
  QuickEditBackgroundSettings,
  QuickEditZoomRegion,
} from '../../features/video/review/advanced/types';
import {
  computeQuickEditSceneCamera,
  computeQuickEditSpatialWindow,
  computeQuickEditVideoTransform,
} from '../../features/video/review/advanced/scene';
import {
  computeZoomPreviewArea,
  paintZoomPreview,
  previewBackgroundPaint,
  type ZoomPreviewLayout,
} from './zoom-preview-paint';
import type { ZoomPreviewFrame } from './use-zoom-preview-source';

type ZoomCanvasProps = {
  background: QuickEditBackgroundSettings;
  imageUrl: string | null | undefined;
  headerImage?: CanvasImageSource | null | undefined;
  camera: QuickEditZoomRegion['transform'];
  disabled?: boolean | undefined;
  frame: ZoomPreviewFrame | null;
  live?: boolean | undefined;
  layout: ZoomPreviewLayout;
  output: { width: number; height: number };
  view: 'area' | 'result';
  cornerRadius: number;
  previewScale?: number;
  onPreview?:
    | ((center: { centerX: number; centerY: number; scale?: number } | null) => void)
    | undefined;
  onCenter(center: { centerX: number; centerY: number; scale?: number }): void;
};

/** Interactive source canvas and its editor frame share one camera model. */
export function ZoomPreviewCanvas(props: ZoomCanvasProps) {
  const { view } = props;
  const {
    canvasRef,
    areaRef,
    trackPointer,
    pointerInteraction,
    keyboardInteraction,
    handlers,
    opening,
    motion,
    offsetX,
    offsetY,
    spatialFailure,
    retrySpatial,
  } = useZoomCanvasModel(props);
  return (
    <>
      <ZoomPreviewBackground
        background={props.background}
        imageUrl={props.imageUrl}
        view={view}
        offsetX={offsetX}
        offsetY={offsetY}
        scale={motion.scale}
      />
      {spatialFailure ? (
        <div role="alert" className="relative z-20 p-2 text-xs">
          {translate('gallery.videoReview.spatialUnavailable')}
          <ReviewButton label={translate('gallery.videoReview.retry')} onClick={retrySpatial} />
        </div>
      ) : null}
      <canvas
        ref={canvasRef}
        data-review-camera-area={view === 'area' ? '' : undefined}
        aria-label={translate('gallery.videoReview.zoomPreview')}
        tabIndex={props.disabled ? -1 : 0}
        width={props.output.width}
        height={props.output.height}
        style={{ touchAction: 'none' }}
        className="relative block w-full rounded-[var(--sniptale-radius-sm)] border
        border-[var(--sniptale-color-border-soft)] outline-none
        focus-visible:ring-1 focus-visible:ring-[var(--sniptale-color-accent)]"
        {...handlers}
        onFocus={() => {
          handlers.onFocus();
          keyboardInteraction();
        }}
        onKeyDown={(event) => {
          if (event.key.startsWith('Arrow')) keyboardInteraction();
          handlers.onKeyDown(event);
        }}
        onPointerDown={(event) => {
          handlers.onPointerDown(event);
          trackPointer(event);
        }}
        onPointerMove={(event) => {
          trackPointer(event);
          handlers.onPointerMove(event);
        }}
        onPointerUp={(event) => {
          trackPointer(event);
          handlers.onPointerUp(event);
        }}
        onPointerLeave={trackPointer}
      />
      {view === 'area' ? (
        <div
          data-focus-plane
          className="pointer-events-none absolute inset-0"
          onPointerDown={(event) => {
            handlers.onPointerDown(event);
            trackPointer(event);
          }}
        >
          <ReviewFocusFrame
            frameRef={areaRef}
            area={opening}
            output={props.output}
            visible={true}
            pointerInteraction={pointerInteraction}
            borderWidth={2}
            center={{
              x: opening.x + opening.width / 2,
              y: opening.y + opening.height / 2,
            }}
            onPointerEnter={trackPointer}
            onPointerMove={trackPointer}
            onPointerLeave={trackPointer}
            title={translate('gallery.videoReview.focusAreaHint')}
          />
        </div>
      ) : null}
    </>
  );
}

/** Background visual composition is independent of source-frame gesture capture and canvas paint. */
function ZoomPreviewBackground({
  background,
  imageUrl,
  view,
  offsetX,
  offsetY,
  scale,
}: {
  background: QuickEditBackgroundSettings;
  imageUrl: string | null | undefined;
  headerImage?: CanvasImageSource | null | undefined;
  view: 'area' | 'result';
  offsetX: number;
  offsetY: number;
  scale: number;
}) {
  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={{
        background: previewBackgroundPaint(background),
        transformOrigin: '0 0',
        transform:
          view === 'result' ? `translate(${offsetX}%, ${offsetY}%) scale(${scale})` : undefined,
      }}
    >
      {imageUrl && background.enabled && background.type === 'image' ? (
        <img
          src={imageUrl}
          alt=""
          className="absolute inset-0 h-full w-full"
          style={{ objectFit: background.imageFit }}
        />
      ) : null}
    </div>
  );
}

/** Camera projection and hover belong to this local model; source loading stays in the parent. */
function useZoomCanvasModel(props: ZoomCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const {
    frame: areaRef,
    trackPointer,
    pointerInteraction,
    keyboardInteraction,
  } = useFocusFrameHover();
  const windowRect = props.layout.windowRect;
  const follows = props.background.enabled && props.background.zoomBehavior === 'follow-video';
  const viewport = follows
    ? {
        x: -windowRect.x / windowRect.width,
        y: -windowRect.y / windowRect.height,
        width: props.output.width / windowRect.width,
        height: props.output.height / windowRect.height,
      }
    : { x: 0, y: 0, width: 1, height: 1 };
  const projectedWindow = computeQuickEditSpatialWindow(props.layout, props.background);
  const projection =
    props.camera.spatial && props.view === 'result'
      ? quickEditPlaneProjection(projectedWindow, projectedWindow, props.camera.spatial)
      : undefined;
  const { camera, handlers } = useReviewCameraGesture({
    pointerProjection: projection ? { matrix: projection, output: props.output } : undefined,
    ...props,
    interactionElement: canvasRef,
    viewport,
    videoRect: props.layout.windowRect,
    visibleArea: computeZoomPreviewArea(props.layout, props.background, props.output),
    onCommit: props.onCenter,
  });
  const layout = useMemo(
    () => ({
      ...props.layout,
      videoTransform: computeQuickEditVideoTransform({
        videoRect: props.layout.videoRect,
        windowRect: props.layout.windowRect,
        camera,
      }),
    }),
    [props.layout, camera]
  );
  const { spatialFailure, retrySpatial } = useZoomCanvasPaint(canvasRef, {
    ...props,
    camera,
    layout,
  });

  const visible = computeZoomPreviewArea(layout, props.background, props.output);
  const opening = {
    x: windowRect.x + visible.x * windowRect.width,
    y: windowRect.y + visible.y * windowRect.height,
    width: visible.width * windowRect.width,
    height: visible.height * windowRect.height,
  };
  const motion = computeQuickEditSceneCamera(layout, props.background);
  const offsetX = (motion.x / props.output.width) * 100;
  const offsetY = (motion.y / props.output.height) * 100;
  return {
    spatialFailure,
    retrySpatial,
    canvasRef,
    areaRef,
    trackPointer,
    pointerInteraction,
    keyboardInteraction,
    handlers,
    opening,
    motion,
    offsetX,
    offsetY,
  };
}

/** Imperative painting has one canvas resource and follows actual frame/camera updates. */
function useZoomCanvasPaint(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  props: ZoomCanvasProps
) {
  const renderer = useRef<ReturnType<typeof createReviewSpatialRenderer> | null>(null);
  const [spatialFailure, setFailure] = useState(false);
  const [retry, setRetry] = useState(0);
  const spatial = props.view === 'result' && !!props.camera.spatial;
  useEffect(() => {
    if (!spatial) {
      setFailure(false);
      return;
    }
    try {
      renderer.current = createReviewSpatialRenderer(() => setFailure(true));
      setFailure(false);
    } catch {
      setFailure(true);
    }
    return () => {
      renderer.current?.dispose();
      renderer.current = null;
    };
  }, [spatial, retry]);
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const paint = () => {
      try {
        paintZoomPreview(context, {
          spatialRenderer: renderer.current ?? undefined,
          background: props.background,
          accent:
            getComputedStyle(canvas).getPropertyValue('--sniptale-color-accent').trim() ||
            '#4f7cff',
          camera: props.camera,
          cornerRadius: props.cornerRadius,
          previewScale: props.previewScale ?? 1,
          frame: props.frame,
          headerImage: props.headerImage,
          height: canvas.height,
          layout: props.layout,
          view: props.view,
          showControls: false,
          width: canvas.width,
        });
      } catch {
        context.clearRect(0, 0, canvas.width, canvas.height);
        setFailure(true);
      }
    };
    paint();
    if (!props.live) return;
    let request: number;
    const tick = () => {
      paint();
      request = requestAnimationFrame(tick);
    };
    request = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(request);
  }, [
    canvasRef,
    props.layout,
    props.frame,
    props.headerImage,
    props.view,
    props.camera,
    props.cornerRadius,
    props.previewScale,
    props.background,
    props.live,
    retry,
  ]);
  return { spatialFailure, retrySpatial: () => setRetry((v) => v + 1) };
}
