import { useReviewWindowHeader } from './use-window-header';
import { ZoomPreviewCanvas } from './zoom-preview-canvas';
import { ReviewSpotlightPreview } from './spotlight-preview';
import { useMemo, useState } from 'react';
import { useReviewBackgroundImage } from './use-review-background';
import { translate } from '../../platform/i18n';
import type {
  QuickEditBackgroundSettings,
  QuickEditZoomRegion,
} from '../../features/video/review/advanced/types';
import {
  computeQuickEditSceneLayout,
  computeQuickEditSceneSize,
} from '../../features/video/review/advanced/scene';
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
  windowHeader?:
    | import('../../features/video/review/advanced/types').QuickEditWindowHeader
    | undefined;
  /** Result-time region midpoint mapped through cuts/speed; null while it has no frame. */
  sourceTime: number | null;
  loadFrame: ZoomPreviewFrameLoader | null;
  /** Read-only transport sample while playing; paused editing retains the selected target. */
  playback?: { video: HTMLVideoElement; camera: QuickEditZoomRegion['transform'] } | undefined;
  onInteract?: ((sourceTime: number) => void) | undefined;
  onChange(patch: QuickEditZoomRegionPatch): void;
  onPreview?: ((patch: QuickEditZoomRegionPatch | null) => void) | undefined;
  disabled?: boolean;
}) {
  const { loadFrame, region, sourceTime } = props;
  const image = useReviewBackgroundImage(props.background);
  const header = useReviewWindowHeader(props.windowHeader, props.source.width);
  const [view, setView] = useState<'area' | 'result'>('area');
  const { frame, status, retry } = useZoomPreviewFrame(loadFrame, sourceTime);
  const playback = region.spotlight ? undefined : props.playback;
  const camera = playback?.camera ?? region.transform;

  const { output, layout, previewScale, cornerRadius } = useZoomPreviewGeometry(
    props,
    camera,
    !!region.spotlight
  );
  const previewStatus = playback ? 'ready' : status;
  const interactive = !props.disabled && !playback && status === 'ready';
  const background = props.background;
  return (
    <section
      data-ui="gallery.videoReview.zoomPreview"
      data-view={view}
      data-status={previewStatus}
      data-playing={!!playback}
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
        {...previewInteractionHandlers(interactive, sourceTime, props.onInteract)}
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
            headerImage={header.image}
            key={region.id}
            region={region}
            spotlight={region.spotlight}
            frame={frame}
            output={output}
            layout={layout}
            cornerRadius={cornerRadius}
            scale={previewScale}
            disabled={!interactive}
            onChange={(spotlight) => props.onChange({ spotlight })}
            onPreview={(spotlight) => props.onPreview?.(spotlight ? { spotlight } : null)}
          />
        ) : (
          <ZoomPreviewCanvas
            headerImage={header.image}
            background={props.background}
            imageUrl={image.url}
            key={region.id}
            cornerRadius={cornerRadius}
            camera={camera}
            disabled={!interactive}
            live={!!playback}
            frame={playback ? { image: playback.video, ...props.source } : frame}
            layout={layout}
            output={output}
            view={view}
            onCenter={props.onChange}
            onPreview={props.onPreview}
          />
        )}
      </div>
      <ZoomPreviewFeedback
        status={previewStatus}
        imageFailed={image.failed || header.failed}
        onRetry={() => {
          image.retry();
          header.retry();
          retry();
        }}
      />
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

/** Frame and background loading feedback stays independent of camera geometry and gestures. */
function ZoomPreviewFeedback(props: {
  status: ReturnType<typeof useZoomPreviewFrame>['status'];
  imageFailed: boolean;
  onRetry(): void;
}) {
  return (
    <>
      {props.status === 'unavailable' || props.status === 'loading' ? (
        <p role="status" className="text-xs text-[var(--sniptale-color-text-muted)]">
          {translate(
            props.status === 'unavailable'
              ? 'gallery.videoReview.zoomPreviewUnavailable'
              : 'gallery.videoReview.zoomPreviewLoading'
          )}
        </p>
      ) : null}
      {props.status === 'failed' || props.imageFailed ? (
        <p
          role="alert"
          className="flex items-center gap-2 text-xs text-[var(--sniptale-color-danger)]"
        >
          <span>{translate('gallery.videoReview.zoomPreviewFailed')}</span>
          <ReviewButton
            label={translate('gallery.videoReview.retry')}
            className="!h-6 !min-h-6 !px-1.5 text-xs"
            onClick={props.onRetry}
          />
        </p>
      ) : null}
    </>
  );
}

/** Memoizes the inspector viewport and source/window projection as one consistent scene. */
function useZoomPreviewGeometry(
  { source, canvas, background, windowHeader }: Parameters<typeof computeQuickEditSceneSize>[0],
  camera: QuickEditZoomRegion['transform'],
  spotlight: boolean
) {
  return useMemo(() => {
    const size = computeQuickEditSceneSize({ source, canvas, background, windowHeader });
    const width = Math.max(1, Math.min(PREVIEW_WIDTH_PX, Math.round(size.width) || 1));
    const height = Math.max(1, Math.round((width * (size.height || 1)) / Math.max(1, size.width)));
    const output = { width, height };
    const previewScale = width / Math.max(1, canvas?.width ?? source.width);
    return {
      output,
      previewScale,
      cornerRadius: background.enabled ? background.layout.cornerRadius * previewScale : 0,
      layout: computeQuickEditSceneLayout({
        source,
        canvas,
        background,
        windowHeader,
        output,
        camera: spotlight ? { scale: 1, centerX: 0.5, centerY: 0.5 } : camera,
      }),
    };
  }, [source, canvas, background, windowHeader, camera, spotlight]);
}
