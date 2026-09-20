import { useReviewCameraGesture } from './camera-gesture';
import { ReviewSpotlightPreview } from './spotlight-preview';
import { useEffect, useMemo, useRef, useState } from 'react';
import { serializePaintToCss } from '@sniptale/foundation/paint';
import { useReviewBackgroundImage } from './use-review-background';
import { translate } from '../../platform/i18n';
import type {
  QuickEditBackgroundSettings,
  QuickEditZoomRegion,
} from '../../features/video/review/advanced/types';
import {
  computeQuickEditSceneLayout,
  computeQuickEditVideoTransform,
} from '../../features/video/review/advanced/scene';
import type { QuickEditZoomRegionPatch } from '../../features/video/review/advanced/zoom';
import { SegmentedRow } from '../../ui/compact-inspector-controls';
import { ReviewButton } from './controls';
import { paintZoomPreview, type ZoomPreviewLayout } from './zoom-preview-paint';
import {
  useZoomPreviewFrame,
  type ZoomPreviewFrame,
  type ZoomPreviewFrameLoader,
} from './use-zoom-preview-source';

/** Bounded canvas size; scene geometry scales padding into these output pixels. */
const PREVIEW_WIDTH_PX = 480;
/**
 * The interactive canvas: pointer drags and arrow keys move the stored camera center;
 * Escape and pointer cancel roll the interaction back to its captured origin.
 */
function ZoomPreviewCanvas(props: {
  camera: QuickEditZoomRegion['transform'];
  disabled?: boolean | undefined;
  frame: ZoomPreviewFrame | null;
  layout: ZoomPreviewLayout;
  output: { width: number; height: number };
  view: 'area' | 'result';
  cornerRadius: number;
  onPreview?: ((center: { centerX: number; centerY: number } | null) => void) | undefined;
  onCenter(center: { centerX: number; centerY: number }): void;
}) {
  const { view } = props;
  const { camera, handlers } = useReviewCameraGesture({
    ...props,
    videoRect: props.layout.videoRect,
    onCommit: props.onCenter,
  });
  const layout = useMemo(
    () => ({
      ...props.layout,
      videoTransform: computeQuickEditVideoTransform({ videoRect: props.layout.videoRect, camera }),
    }),
    [props.layout, camera]
  );
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    paintZoomPreview(context, {
      accent:
        getComputedStyle(canvas).getPropertyValue('--sniptale-color-accent').trim() || '#4f7cff',
      camera,
      cornerRadius: props.cornerRadius,
      frame: props.frame,
      height: canvas.height,
      layout,
      view,
      width: canvas.width,
    });
  }, [layout, props.frame, view, camera, props.cornerRadius]);

  return (
    <canvas
      ref={canvasRef}
      aria-label={translate('gallery.videoReview.zoomPreview')}
      tabIndex={props.disabled ? -1 : 0}
      width={props.output.width}
      height={props.output.height}
      style={{ touchAction: 'none' }}
      className="relative block w-full rounded-[var(--sniptale-radius-sm)] border
        border-[var(--sniptale-color-border-soft)] outline-none
        focus-visible:ring-1 focus-visible:ring-[var(--sniptale-color-accent)]"
      {...handlers}
    />
  );
}

/**
 * Selected-region framing preview: the real source frame at the region midpoint, the
 * scene layout the export applies (background padding plus fitted video), and the zoom
 * footprint through one interactive canvas.
 */
export function ReviewZoomPreview(props: {
  region: QuickEditZoomRegion;
  background: QuickEditBackgroundSettings;
  source: { width: number; height: number };
  canvas?: { width: number; height: number } | undefined;
  /** Result-time region midpoint mapped through cuts/speed; null while it has no frame. */
  sourceTime: number | null;
  loadFrame: ZoomPreviewFrameLoader | null;
  onInteract?: ((sourceTime: number) => void) | undefined;
  onChange(patch: QuickEditZoomRegionPatch): void;
  onPreview?: ((patch: QuickEditZoomRegionPatch | null) => void) | undefined;
  disabled?: boolean;
}) {
  const { loadFrame, region, sourceTime } = props;
  const image = useReviewBackgroundImage(props.background);
  const [view, setView] = useState<'area' | 'result'>('area');
  const { frame, status, retry } = useZoomPreviewFrame(loadFrame, sourceTime);

  const output = useMemo(() => {
    const size = props.canvas ?? props.source;
    const width = Math.max(1, Math.min(PREVIEW_WIDTH_PX, Math.round(size.width) || 1));
    const height = Math.max(1, Math.round((width * (size.height || 1)) / Math.max(1, size.width)));
    return { width, height };
  }, [props.source, props.canvas]);

  const layout = useMemo(
    () =>
      computeQuickEditSceneLayout({
        output,
        canvas: props.canvas,
        source: props.source,
        background: props.background,
        camera: region.spotlight ? { scale: 1, centerX: 0.5, centerY: 0.5 } : region.transform,
      }),
    [output, props.source, props.canvas, props.background, region.transform, region.spotlight]
  );

  const previewScale = output.width / Math.max(1, props.canvas?.width ?? props.source.width);
  const cornerRadius = props.background.enabled
    ? props.background.layout.cornerRadius * previewScale
    : 0;
  const unavailable = sourceTime === null || !loadFrame;
  const background = props.background;
  return (
    <section
      data-ui="gallery.videoReview.zoomPreview"
      data-view={view}
      data-status={status}
      aria-label={translate('gallery.videoReview.zoomPreview')}
      className="space-y-2"
    >
      <div className="flex items-center justify-between gap-2">
        <h5 className="text-xs font-semibold text-[var(--sniptale-color-text-secondary)]">
          {translate(
            region.spotlight
              ? 'gallery.videoReview.focusPreview'
              : 'gallery.videoReview.zoomPreview'
          )}
        </h5>
        {!region.spotlight ? (
          <SegmentedRow<'area' | 'result'>
            ariaLabel={translate('gallery.videoReview.zoomPreview')}
            columns={2}
            value={view}
            options={[
              { value: 'area', label: translate('gallery.videoReview.zoomPreviewArea') },
              { value: 'result', label: translate('gallery.videoReview.zoomPreviewResult') },
            ]}
            onChange={setView}
          />
        ) : null}
      </div>
      <div
        {...previewInteractionHandlers(
          !props.disabled && status === 'ready',
          sourceTime,
          props.onInteract
        )}
        className="relative overflow-hidden rounded-[var(--sniptale-radius-sm)]"
        style={{ background: previewBackgroundPaint(background) }}
      >
        {image.url && background.enabled && background.type === 'image' ? (
          <img
            src={image.url}
            alt=""
            className="pointer-events-none absolute inset-0 h-full w-full"
            style={{ objectFit: background.imageFit }}
          />
        ) : null}
        {region.spotlight ? (
          <ReviewSpotlightPreview
            key={region.id}
            region={region}
            spotlight={region.spotlight}
            frame={frame}
            output={output}
            layout={layout}
            cornerRadius={cornerRadius}
            scale={previewScale}
            disabled={!!props.disabled || status !== 'ready'}
            onChange={(spotlight) => props.onChange({ spotlight })}
            onPreview={(spotlight) => props.onPreview?.(spotlight ? { spotlight } : null)}
          />
        ) : (
          <ZoomPreviewCanvas
            key={region.id}
            cornerRadius={cornerRadius}
            camera={region.transform}
            disabled={props.disabled || status !== 'ready'}
            frame={frame}
            layout={layout}
            output={output}
            view={view}
            onCenter={props.onChange}
            onPreview={props.onPreview}
          />
        )}
      </div>
      {unavailable ? (
        <p role="status" className="text-xs text-[var(--sniptale-color-text-muted)]">
          {translate('gallery.videoReview.zoomPreviewUnavailable')}
        </p>
      ) : null}
      {!unavailable && status === 'loading' ? (
        <p role="status" className="text-xs text-[var(--sniptale-color-text-muted)]">
          {translate('gallery.videoReview.zoomPreviewLoading')}
        </p>
      ) : null}
      {(!unavailable && status === 'failed') || image.failed ? (
        <p
          role="alert"
          className="flex items-center gap-2 text-xs text-[var(--sniptale-color-danger)]"
        >
          <span>{translate('gallery.videoReview.zoomPreviewFailed')}</span>
          <ReviewButton
            label={translate('gallery.videoReview.retry')}
            className="!h-6 !min-h-6 !px-1.5 text-xs"
            onClick={() => {
              image.retry();
              retry();
            }}
          />
        </p>
      ) : null}
    </section>
  );
}

function previewBackgroundPaint(background: QuickEditBackgroundSettings): string {
  if (!background.enabled || background.type === 'image') return '#000000';
  if (background.type === 'solid') return background.color;
  return serializePaintToCss({ kind: 'gradient', gradient: background.gradient });
}

/** Only active framing gestures synchronize transport; loading, Tab and cancel do not seek. */
function previewInteractionHandlers(
  ready: boolean,
  time: number | null,
  onInteract: ((time: number) => void) | undefined
) {
  const seek = () => {
    if (ready && time !== null) onInteract?.(time);
  };
  return {
    onPointerDownCapture: (event: React.PointerEvent) => {
      if (event.button === 0) seek();
    },
    onKeyDownCapture: (event: React.KeyboardEvent) => {
      if (event.key.startsWith('Arrow')) seek();
    },
  };
}
