import { createZoomPreviewPaintOwner } from './zoom-preview-paint-owner';
import { zoomPreviewGpuPointerProjection, type ZoomPreviewGpuInput } from './zoom-preview-gpu';
import { prepareDecodedVideoFrame } from '../../features/video/composition/draw/decoded-sample';
import { ReviewButton } from './controls';
import { ReviewBackgroundBlurPreview } from './background-blur-preview';
import { hasSceneBackgroundMotion } from '../../features/video/project/scene/background-motion';
import { createReviewSpatialSession } from '../../workflows/video-review/spatial-render-session';
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { ReviewFocusFrame, useFocusFrameHover } from './focus-area-frame';
import { useReviewCameraGesture } from './camera-gesture';
import { translate } from '../../platform/i18n';
import type { QuickEditBackgroundSettings } from '../../features/video/review/advanced/types';
import {
  computeQuickEditSceneCamera,
  computeQuickEditVideoTransform,
} from '../../features/video/review/advanced/scene';
import {
  computeZoomPreviewArea,
  paintZoomPreview,
  previewBackgroundPaint,
} from './zoom-preview-paint';
import { drawSceneSpotlights } from '../../features/video/composition/draw/spotlight';

type ZoomCanvasProps = ZoomPreviewGpuInput & {
  disabled?: boolean | undefined;
  onBackend?: ((gpu: boolean) => void) | undefined;
  onPaintReady?: ((ready: boolean) => void) | undefined;
  onPresented?: ((input: ZoomPreviewGpuInput) => void) | undefined;
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
    gpuActive,
  } = useZoomCanvasModel(props);
  return (
    <>
      {!gpuActive ? (
        <ZoomPreviewBackground
          background={props.background}
          imageUrl={props.imageUrl}
          view={view}
          offsetX={offsetX}
          offsetY={offsetY}
          scale={motion.backgroundScale}
          currentTime={props.currentTime}
          output={props.output}
        />
      ) : null}
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
  currentTime,
  output,
}: {
  background: QuickEditBackgroundSettings;
  imageUrl: string | null | undefined;
  headerImage?: CanvasImageSource | null | undefined;
  view: 'area' | 'result';
  offsetX: number;
  offsetY: number;
  scale: number;
  currentTime?: number | undefined;
  output: { width: number; height: number };
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
      {background.enabled &&
      background.type !== 'solid' &&
      hasSceneBackgroundMotion(background.motion) ? (
        <ReviewBackgroundBlurPreview
          background={background}
          imageUrl={imageUrl ?? undefined}
          width={output.width}
          height={output.height}
          currentTime={currentTime}
        />
      ) : imageUrl && background.enabled && background.type === 'image' ? (
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
  const [accepted, setAccepted] = useState<ZoomPreviewGpuInput | null>(null);
  const receivePresented = props.onPresented;
  const onPresented = useCallback(
    (input: ZoomPreviewGpuInput) => {
      setAccepted(input);
      receivePresented?.(input);
    },
    [receivePresented]
  );
  const basis =
    props.view === 'result' &&
    accepted?.view === props.view &&
    accepted.frame?.image === props.frame?.image &&
    accepted.output.width === props.output.width &&
    accepted.output.height === props.output.height
      ? accepted
      : props;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const {
    frame: areaRef,
    trackPointer,
    pointerInteraction,
    keyboardInteraction,
  } = useFocusFrameHover();
  const windowRect = basis.layout.windowRect;
  const follows = basis.background.enabled && basis.background.zoomBehavior === 'follow-video';
  const viewport = follows
    ? {
        x: -windowRect.x / windowRect.width,
        y: -windowRect.y / windowRect.height,
        width: props.output.width / windowRect.width,
        height: props.output.height / windowRect.height,
      }
    : { x: 0, y: 0, width: 1, height: 1 };
  const projection = zoomPreviewGpuPointerProjection(basis);
  const {
    camera: gestureCamera,
    captured,
    handlers,
  } = useReviewCameraGesture({
    pointerProjection: projection ? { matrix: projection, output: props.output } : undefined,
    ...props,
    camera: basis.camera,
    keyboardCamera: props.camera,
    interactionElement: canvasRef,
    viewport,
    videoRect: basis.layout.windowRect,
    visibleArea: computeZoomPreviewArea(basis.layout, basis.background, props.output),
    onCommit: props.onCenter,
  });
  const camera = captured ? gestureCamera : props.camera;
  const layout = useMemo(() => {
    const layout = {
      ...props.layout,
      videoTransform: computeQuickEditVideoTransform({
        videoRect: props.layout.videoRect,
        windowRect: props.layout.windowRect,
        camera,
      }),
    };
    if (camera.spatial) layout.spatial = camera.spatial;
    else delete layout.spatial;
    return layout;
  }, [props.layout, camera]);
  const { spatialFailure, retrySpatial, gpuActive } = useZoomPreviewCanvasPaint(canvasRef, {
    ...props,
    camera,
    layout,
    onPresented,
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
    gpuActive,
    canvasRef,
    areaRef,
    trackPointer,
    pointerInteraction,
    keyboardInteraction,
    handlers: {
      ...handlers,
      onPointerDown(event: Parameters<typeof handlers.onPointerDown>[0]) {
        if (
          !captured &&
          props.view === 'result' &&
          basis !== props &&
          basis.authoringRevision !== props.authoringRevision
        )
          return;
        handlers.onPointerDown(event);
      },
    },
    opening,
    motion,
    offsetX,
    offsetY,
  };
}

function areaRasterKey(
  props: Pick<ZoomCanvasProps, 'background' | 'layout' | 'cornerRadius'> & {
    previewScale: number | undefined;
  },
  canvas: HTMLCanvasElement,
  retry: number
) {
  return JSON.stringify([
    props.background,
    props.layout.videoRect,
    props.layout.windowRect,
    props.layout.visibleVideoRect,
    props.layout.sourceCrop,
    props.cornerRadius,
    props.previewScale,
    canvas.width,
    canvas.height,
    retry,
  ]);
}

type ZoomPaintCache = {
  painted: {
    key: string;
    lens: boolean;
    frame: ZoomCanvasProps['frame'];
    header: ZoomCanvasProps['headerImage'];
  } | null;
  lensBase: HTMLCanvasElement | null;
};

function releaseZoomLensBase(cache: ZoomPaintCache) {
  if (cache.lensBase) cache.lensBase.width = cache.lensBase.height = 0;
  cache.lensBase = null;
}

function zoomPaintKey(props: ZoomPreviewGpuInput, canvas: HTMLCanvasElement, retry: number) {
  if (props.live) return null;
  if (props.view === 'area')
    return areaRasterKey(
      {
        background: props.background,
        layout: props.layout,
        cornerRadius: props.cornerRadius,
        previewScale: props.previewScale,
      },
      canvas,
      retry
    );
  return JSON.stringify([
    props.background,
    props.layout,
    props.camera,
    props.cornerRadius,
    props.previewScale,
    canvas.width,
    canvas.height,
    retry,
  ]);
}

function restoreZoomPaint(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  cache: ZoomPaintCache,
  key: string | null,
  props: ZoomPreviewGpuInput
) {
  if (
    key === null ||
    cache.painted?.key !== key ||
    cache.painted.frame !== props.frame ||
    cache.painted.header !== props.headerImage
  )
    return false;
  if (props.view === 'area') return true;
  if (!props.lensFrames?.length) return !cache.painted.lens;
  if (!cache.lensBase) return false;
  context.drawImage(cache.lensBase, 0, 0);
  drawSceneSpotlights(context, canvas, null, props.lensFrames);
  return true;
}

function captureZoomLensBase(canvas: HTMLCanvasElement, cache: ZoomPaintCache) {
  const base = cache.lensBase ?? canvas.ownerDocument.createElement('canvas');
  base.width = canvas.width;
  base.height = canvas.height;
  base.getContext('2d')?.drawImage(canvas, 0, 0);
  cache.lensBase = base;
}

/** One source/camera request owner serializes both GPU completion and the supported fallback. */
export function useZoomPreviewCanvasPaint(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  props: ZoomPreviewGpuInput & {
    onBackend?: ((gpu: boolean) => void) | undefined;
    onPaintReady?: ((ready: boolean) => void) | undefined;
    onPresented?: ((input: ZoomPreviewGpuInput) => void) | undefined;
  }
) {
  const renderer = useRef<ReturnType<typeof createReviewSpatialSession> | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const cache = useRef<ZoomPaintCache>({ painted: null, lensBase: null });
  const [spatialFailure, setFailure] = useState(false);
  const [gpuActive, setGpuActive] = useState(
    () => typeof navigator !== 'undefined' && !!navigator.gpu
  );
  const [painted, setPainted] = useState<ZoomPreviewGpuInput | null>(null);
  const paintReady =
    !spatialFailure &&
    painted?.frame?.image === props.frame?.image &&
    painted?.view === props.view &&
    painted.output.width === props.output.width &&
    painted.output.height === props.output.height;
  const [retry, setRetry] = useState(0);
  const owner = useMemo(
    () =>
      createZoomPreviewPaintOwner({
        publish(bitmap) {
          const canvas = canvasRef.current;
          const context = canvas?.getContext('2d');
          if (!canvas || !context) throw new Error('Inspector canvas is unavailable.');
          context.clearRect(0, 0, canvas.width, canvas.height);
          context.drawImage(bitmap, 0, 0);
        },
        async fallback(input, signal) {
          const canvas = canvasRef.current;
          const context = canvas?.getContext('2d');
          if (!canvas || !context) throw new Error('Inspector canvas is unavailable.');
          const spatial = input.view === 'result' && !!input.camera.spatial;
          if (spatial && !renderer.current)
            renderer.current = createReviewSpatialSession(() => setFailure(true));
          if (!spatial) {
            renderer.current?.dispose();
            renderer.current = null;
          }
          const paint = (frame = input.frame) => {
            const cacheLensBase =
              input.view === 'result' && !input.live && !!input.lensFrames?.length;
            if (!cacheLensBase) releaseZoomLensBase(cache.current);
            const key = zoomPaintKey(input, canvas, retry);
            if (restoreZoomPaint(context, canvas, cache.current, key, input)) return;
            cache.current.painted = null;
            paintZoomPreview(context, {
              spatialRenderer: renderer.current ?? undefined,
              background: input.background,
              accent: '#4f7cff',
              camera: input.camera,
              cornerRadius: input.cornerRadius,
              previewScale: input.previewScale ?? 1,
              frame,
              headerImage: input.headerImage,
              height: canvas.height,
              layout: input.layout,
              view: input.view,
              showControls: false,
              width: canvas.width,
            });
            if (cacheLensBase) captureZoomLensBase(canvas, cache.current);
            if (input.lensFrames?.length)
              drawSceneSpotlights(context, canvas, null, input.lensFrames);
            if (key !== null)
              cache.current.painted = {
                key,
                lens: !!input.lensFrames?.length,
                frame: input.frame,
                header: input.headerImage,
              };
          };
          if (input.frame?.image instanceof HTMLVideoElement) {
            const captured = await prepareDecodedVideoFrame(
              new VideoFrame(input.frame.image),
              signal
            );
            try {
              signal.throwIfAborted();
              paint({ ...input.frame, image: captured });
            } finally {
              captured.close();
            }
          } else {
            signal.throwIfAborted();
            paint();
          }
        },
        onBackend(gpu) {
          setGpuActive(gpu);
          setFailure(false);
        },
        onPresented(input) {
          setPainted(input);
          latest.current.onPresented?.(input);
        },
        onError() {
          setFailure(true);
        },
      }),
    [canvasRef, retry]
  );
  useEffect(
    () => () => {
      owner.dispose();
      renderer.current?.dispose();
      renderer.current = null;
      releaseZoomLensBase(cache.current);
      cache.current.painted = null;
    },
    [owner]
  );
  useEffect(() => {
    owner.update(props);
  }, [owner, props]);
  const onBackend = props.onBackend;
  const onPaintReady = props.onPaintReady;
  useEffect(() => {
    onBackend?.(gpuActive);
  }, [onBackend, gpuActive]);
  useEffect(() => {
    onPaintReady?.(paintReady);
  }, [onPaintReady, paintReady]);
  return { spatialFailure, gpuActive, retrySpatial: () => setRetry((value) => value + 1) };
}
