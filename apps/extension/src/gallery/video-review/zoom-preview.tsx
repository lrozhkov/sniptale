import { ReviewMotionBlurPreview } from './motion-blur-preview';
import { ReviewSpotlightOverlay } from './spotlight-overlay';
import { ReviewBorderOverlay } from './border-overlay';
import { evaluateQuickEditSpotlightsAtTime } from '../../features/video/review/advanced/focus';
import { evaluateQuickEditBordersAtTime } from '../../features/video/review/advanced/border';
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
  evaluateQuickEditCameraAtTime,
  computeQuickEditSceneCamera,
  computeQuickEditWindowTransform,
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
  focus?: { regions: readonly QuickEditZoomRegion[]; time: number } | undefined;
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
  const overlay = !!(region.spotlight || region.border);
  const playback = props.playback;
  const camera = resolvePreviewCamera(props, view);

  const { output, layout, previewScale, cornerRadius } = useZoomPreviewGeometry(props, camera);
  const previewStatus = playback ? 'ready' : status;
  const interactive = !props.disabled && !playback && status === 'ready';
  const background = props.background;
  const surface = {
    background,
    headerImage: header.image,
    imageUrl: image.url,
    cornerRadius,
    camera,
    disabled: !interactive,
    live: !!playback,
    frame: playback ? { image: playback.video, ...props.source } : frame,
    layout,
    output,
    onPreview: props.onPreview,
  };
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
            region.border
              ? 'gallery.videoReview.borderPreview'
              : overlay
                ? 'gallery.videoReview.focusPreview'
                : 'gallery.videoReview.zoomPreview'
          )}
        </h5>
        {
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
        }
      </div>
      <div
        {...previewInteractionHandlers(interactive, sourceTime, props.onInteract)}
        className="relative overflow-hidden rounded-[var(--sniptale-radius-sm)]"
        style={{ background: overlay ? previewBackgroundPaint(background) : '#000000' }}
      >
        {overlay ? (
          <ReviewSpotlightPreview
            {...surface}
            key={region.id}
            region={region}
            focus={props.focus}
            view={playback ? 'result' : view}
            scale={previewScale}
            onChange={props.onChange}
          />
        ) : (
          <ZoomPreviewCanvas
            {...surface}
            key={region.id}
            previewScale={previewScale}
            view={view}
            onCenter={props.onChange}
          />
        )}
        {!overlay && (view === 'result' || playback) ? (
          <ReviewMotionBlurPreview
            focus={props.focus}
            camera={camera}
            layout={layout}
            output={output}
            background={background}
            imageUrl={image.url}
            headerImage={header.image}
            sceneScale={previewScale}
            getFrame={() => playback?.video ?? frame?.image ?? null}
          />
        ) : null}
        {!overlay && (view === 'result' || playback) ? (
          <ZoomResultOverlays
            region={region}
            focus={props.focus}
            background={background}
            output={output}
            layout={layout}
            scale={previewScale * camera.scale}
            cornerRadius={cornerRadius}
          />
        ) : null}
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

/** Framing uses the full source; results use the independently sampled camera. */
function resolvePreviewCamera(
  props: Parameters<typeof ReviewZoomPreview>[0],
  view: 'area' | 'result'
) {
  if (props.playback) return props.playback.camera;
  if (!props.region.spotlight && !props.region.border) return props.region.transform;
  if (view === 'area') return { scale: 1, centerX: 0.5, centerY: 0.5 };
  return props.focus
    ? evaluateQuickEditCameraAtTime(props.focus.regions, props.focus.time)
    : props.region.transform;
}

/** Results composite all sampled masks before source-attached strokes in the same window. */
function ZoomResultOverlays(props: {
  region: QuickEditZoomRegion;
  focus: Parameters<typeof ReviewZoomPreview>[0]['focus'];
  background: QuickEditBackgroundSettings;
  output: { width: number; height: number };
  layout: ReturnType<typeof computeQuickEditSceneLayout>;
  scale: number;
  cornerRadius: number;
}) {
  const sample = {
    regions: props.focus?.regions ?? [props.region],
    time: props.focus?.time ?? (props.region.start + props.region.end) / 2,
    output: props.output,
    video: computeQuickEditWindowTransform(props.layout),
    scale: props.scale,
  };
  const motion = computeQuickEditSceneCamera(props.layout, props.background);
  const clip = { rect: motion.windowClip, radius: props.cornerRadius * motion.scale };
  return (
    <>
      <ReviewSpotlightOverlay
        output={props.output}
        frames={evaluateQuickEditSpotlightsAtTime(sample)}
        clip={clip}
      />
      <ReviewBorderOverlay
        output={props.output}
        frames={evaluateQuickEditBordersAtTime(sample)}
        clip={clip}
      />
    </>
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
  camera: QuickEditZoomRegion['transform']
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
        camera,
      }),
    };
  }, [source, canvas, background, windowHeader, camera]);
}
