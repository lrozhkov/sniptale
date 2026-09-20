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
  quickEditCanvasPointToContent,
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
const KEYBOARD_CENTER_STEP = 0.01;
const KEYBOARD_CENTER_STEP_COARSE = 0.1;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

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
  onCenter(center: { centerX: number; centerY: number }): void;
}) {
  const { onCenter, view } = props;
  const [draft, setDraft] = useState<QuickEditZoomRegion['transform'] | null>(null);
  const camera = draft ?? props.camera;
  const layout = useMemo(
    () => ({
      ...props.layout,
      videoTransform: computeQuickEditVideoTransform({ videoRect: props.layout.videoRect, camera }),
    }),
    [props.layout, camera]
  );
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ pointerId: number; target: ZoomPreviewLayout['videoRect'] } | null>(null);
  const baseline = useRef<{ x: number; y: number } | null>(null);

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

  const centerFromPointer = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const bounds = canvas?.getBoundingClientRect();
    if (!canvas || !bounds || !(bounds.width > 0) || !(bounds.height > 0)) return null;
    const point = {
      x: (event.clientX - bounds.left) * (canvas.width / bounds.width),
      y: (event.clientY - bounds.top) * (canvas.height / bounds.height),
    };
    const target =
      drag.current?.target ?? (view === 'area' ? layout.videoRect : layout.videoTransform);
    const content = quickEditCanvasPointToContent(point, target);
    if (content) return { centerX: clamp01(content.x), centerY: clamp01(content.y) };
    return {
      centerX: clamp01((point.x - target.x) / Math.max(1, target.width)),
      centerY: clamp01((point.y - target.y) / Math.max(1, target.height)),
    };
  };

  const rollback = () => {
    if (!drag.current && baseline.current)
      onCenter({ centerX: baseline.current.x, centerY: baseline.current.y });
    baseline.current = null;
    drag.current = null;
    setDraft(null);
  };
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
      onFocus={() => {
        baseline.current = { x: camera.centerX, y: camera.centerY };
      }}
      onBlur={() => {
        baseline.current = null;
      }}
      onPointerDown={(event) => {
        if (props.disabled || event.button !== 0) return;
        baseline.current = { x: camera.centerX, y: camera.centerY };
        drag.current = {
          pointerId: event.pointerId,
          target: view === 'area' ? layout.videoRect : layout.videoTransform,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
        const center = centerFromPointer(event);
        if (center) setDraft({ ...camera, ...center });
      }}
      onPointerMove={(event) => {
        if (!drag.current || drag.current.pointerId !== event.pointerId) return;
        const center = centerFromPointer(event);
        if (center) setDraft({ ...camera, ...center });
      }}
      onPointerUp={(event) => {
        if (drag.current?.pointerId !== event.pointerId) return;
        if (draft) onCenter({ centerX: draft.centerX, centerY: draft.centerY });
        setDraft(null);
        baseline.current = null;
        drag.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={rollback}
      onLostPointerCapture={() => {
        if (drag.current) rollback();
      }}
      onKeyDown={(event) => {
        if (props.disabled) return;
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          rollback();
          return;
        }
        const step = event.shiftKey ? KEYBOARD_CENTER_STEP_COARSE : KEYBOARD_CENTER_STEP;
        const delta =
          event.key === 'ArrowLeft'
            ? { centerX: camera.centerX - step }
            : event.key === 'ArrowRight'
              ? { centerX: camera.centerX + step }
              : event.key === 'ArrowUp'
                ? { centerY: camera.centerY - step }
                : event.key === 'ArrowDown'
                  ? { centerY: camera.centerY + step }
                  : null;
        if (!delta) return;
        event.preventDefault();
        event.stopPropagation();
        onCenter({
          centerX: clamp01(delta.centerX ?? camera.centerX),
          centerY: clamp01(delta.centerY ?? camera.centerY),
        });
      }}
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
  /** Result-time region midpoint mapped through cuts/speed; null while it has no frame. */
  sourceTime: number | null;
  loadFrame: ZoomPreviewFrameLoader | null;
  onChange(patch: QuickEditZoomRegionPatch): void;
  disabled?: boolean;
}) {
  const { loadFrame, region, sourceTime } = props;
  const image = useReviewBackgroundImage(props.background);
  const [view, setView] = useState<'area' | 'result'>('area');
  const { frame, status, retry } = useZoomPreviewFrame(loadFrame, sourceTime);

  const output = useMemo(() => {
    const width = Math.max(1, Math.min(PREVIEW_WIDTH_PX, Math.round(props.source.width) || 1));
    const height = Math.max(
      1,
      Math.round((width * (props.source.height || 1)) / Math.max(1, props.source.width))
    );
    return { width, height };
  }, [props.source.width, props.source.height]);

  const layout = useMemo(
    () =>
      computeQuickEditSceneLayout({
        output,
        source: props.source,
        background: props.background,
        camera: region.transform,
      }),
    [output, props.source, props.background, region.transform]
  );

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
          {translate('gallery.videoReview.zoomPreview')}
        </h5>
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
      </div>
      <div
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
        <ZoomPreviewCanvas
          key={region.id}
          cornerRadius={
            background.enabled
              ? (background.layout.cornerRadius * output.width) / Math.max(1, props.source.width)
              : 0
          }
          camera={region.transform}
          disabled={props.disabled || status !== 'ready'}
          frame={frame}
          layout={layout}
          output={output}
          view={view}
          onCenter={props.onChange}
        />
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
