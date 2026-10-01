import { ZoomPreviewCanvas } from './zoom-preview-canvas';
import { ReviewSpotlightPreview } from './spotlight-preview';
import { useMemo, useState } from 'react';
import { useReviewBackgroundImage } from './use-review-background';
import { translate } from '../../platform/i18n';
import type {
  QuickEditBackgroundSettings,
  QuickEditZoomRegion,
} from '../../features/video/review/advanced/types';
import { computeQuickEditSceneLayout } from '../../features/video/review/advanced/scene';
import type { QuickEditZoomRegionPatch } from '../../features/video/review/advanced/zoom';
import { SegmentedSwitch } from '@sniptale/ui/segmented-switch';
import { ReviewButton } from './controls';
import { previewBackgroundPaint } from './zoom-preview-paint';
import { useZoomPreviewFrame, type ZoomPreviewFrameLoader } from './use-zoom-preview-source';

/** Bounded canvas size; scene geometry scales padding into these output pixels. */
const PREVIEW_WIDTH_PX = 480;
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
          <SegmentedSwitch<'area' | 'result'>
            dataAttribute={{ 'data-ui': 'gallery.videoReview.previewMode' }}
            ariaLabel={translate('gallery.videoReview.zoomPreview')}
            density="compact"
            activeId={view}
            options={[
              { id: 'area', label: translate('gallery.videoReview.zoomPreviewArea') },
              { id: 'result', label: translate('gallery.videoReview.zoomPreviewResult') },
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
        style={{ background: region.spotlight ? previewBackgroundPaint(background) : '#000000' }}
      >
        {region.spotlight && image.url && background.enabled && background.type === 'image' ? (
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
            background={props.background}
            imageUrl={image.url}
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
