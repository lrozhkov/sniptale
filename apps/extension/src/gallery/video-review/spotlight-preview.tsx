import { ReviewMotionBlurPreview } from './motion-blur-preview';
import { useEffect, useRef, useState } from 'react';
import { ReviewFocusArea } from './focus-area';
import { evaluateQuickEditSpotlightsAtTime } from '../../features/video/review/advanced/focus';
import { evaluateQuickEditBordersAtTime } from '../../features/video/review/advanced/border';
import {
  computeQuickEditSceneCamera,
  computeQuickEditSourceWindowTransform,
} from '../../features/video/review/advanced/scene';
import type {
  QuickEditBackgroundSettings,
  QuickEditZoomRegion,
} from '../../features/video/review/advanced/types';
import type { QuickEditZoomRegionPatch } from '../../features/video/review/advanced/zoom';
import {
  paintZoomPreview,
  previewBackgroundPaint,
  type ZoomPreviewLayout,
} from './zoom-preview-paint';
import type { ZoomPreviewFrame } from './use-zoom-preview-source';
import { ReviewSpotlightOverlay } from './spotlight-overlay';
import { ReviewBorderOverlay } from './border-overlay';
import { translate } from '../../platform/i18n';

/** Overlay framing and result share source geometry; local drafts commit once. */
export function ReviewSpotlightPreview(props: {
  region: QuickEditZoomRegion;
  focus?: { regions: readonly QuickEditZoomRegion[]; time: number } | undefined;
  frame: ZoomPreviewFrame | null;
  live?: boolean;
  imageUrl?: string | null | undefined;
  headerImage?: CanvasImageSource | null | undefined;
  output: { width: number; height: number };
  layout: ZoomPreviewLayout;
  cornerRadius: number;
  background?: QuickEditBackgroundSettings;
  scale: number;
  camera: QuickEditZoomRegion['transform'];
  view: 'area' | 'result';
  disabled: boolean;
  onChange(value: QuickEditZoomRegionPatch): void;
  onPreview?: ((value: QuickEditZoomRegionPatch | null) => void) | undefined;
}) {
  const [draft, setDraft] = useState<NonNullable<QuickEditZoomRegion['spotlight']>['area'] | null>(
    null
  );
  const region: QuickEditZoomRegion = { ...props.region };
  if (draft && region.border) region.border = { ...region.border, area: draft };
  if (draft && region.spotlight) region.spotlight = { ...region.spotlight, area: draft };
  const overlay = region.spotlight ?? region.border;
  const framing = props.view === 'area';
  const framingRegion = {
    ...region,
    enter: { type: 'none' as const, duration: 0 },
    exit: { type: 'none' as const, duration: 0 },
  };
  delete framingRegion.borderClock;
  if (framingRegion.border) framingRegion.border = { ...framingRegion.border, loop: false };
  const regions = framing ? [framingRegion] : (props.focus?.regions ?? [region]);
  const args = {
    regions,
    time: framing ? region.start : (props.focus?.time ?? (region.start + region.end) / 2),
    output: props.output,
    video: computeQuickEditSourceWindowTransform(props.layout),
    scale: props.scale * props.camera.scale,
  };
  const motion = computeQuickEditSceneCamera(props.layout, props.background ?? { enabled: false });
  const patchArea = (area: NonNullable<typeof overlay>['area']): QuickEditZoomRegionPatch =>
    region.border
      ? { border: { ...region.border, area } }
      : { spotlight: { ...region.spotlight!, area } };
  return (
    <div className="relative">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: previewBackgroundPaint(props.background ?? { enabled: false }),
          transformOrigin: '0 0',
          transform: `translate(${motion.x}px, ${motion.y}px) scale(${motion.backgroundScale})`,
        }}
      >
        {props.imageUrl && props.background?.enabled && props.background.type === 'image' ? (
          <img
            src={props.imageUrl}
            alt=""
            className="absolute inset-0 h-full w-full"
            style={{ objectFit: props.background.imageFit }}
          />
        ) : null}
      </div>
      <SpotlightSourceFrame {...props} />
      {!framing ? (
        <ReviewMotionBlurPreview
          focus={props.focus}
          camera={props.camera}
          layout={props.layout}
          output={props.output}
          background={props.background ?? { enabled: false }}
          imageUrl={props.imageUrl}
          headerImage={props.headerImage}
          sceneScale={props.scale}
          getFrame={() => props.frame?.image ?? null}
        />
      ) : null}
      <ReviewSpotlightOverlay
        output={props.output}
        frames={evaluateQuickEditSpotlightsAtTime(args)}
        clip={{ rect: motion.windowClip, radius: props.cornerRadius * motion.scale }}
      />
      <ReviewBorderOverlay
        output={props.output}
        frames={evaluateQuickEditBordersAtTime(args)}
        clip={{ rect: motion.windowClip, radius: props.cornerRadius * motion.scale }}
      />
      {overlay && framing ? (
        <ReviewFocusArea
          alwaysVisible
          area={overlay.area}
          label={translate(
            region.border ? 'gallery.videoReview.focusBorder' : 'gallery.videoReview.focusSpotlight'
          )}
          output={props.output}
          video={computeQuickEditSourceWindowTransform(props.layout)}
          disabled={props.disabled}
          onChange={(area) => props.onChange(patchArea(area))}
          onPreview={(area) => {
            const patch = area ? patchArea(area) : null;
            setDraft(area);
            props.onPreview?.(patch);
          }}
        />
      ) : null}
    </div>
  );
}

/** Source painting follows the same transformed window as the decorative overlays. */
function SpotlightSourceFrame(props: Parameters<typeof ReviewSpotlightPreview>[0]) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const context = canvas.current?.getContext('2d');
    if (!context) return;
    const paint = () =>
      paintZoomPreview(context, {
        accent: '#ffffff',
        background: props.background ?? { enabled: false },
        previewScale: props.scale,
        camera: props.camera,
        cornerRadius: props.cornerRadius,
        frame: props.frame,
        headerImage: props.headerImage,
        height: props.output.height,
        width: props.output.width,
        layout: props.layout,
        view: 'result',
      });
    paint();
    if (!props.live) return;
    let request: number;
    const tick = () => {
      paint();
      request = requestAnimationFrame(tick);
    };
    request = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(request);
  }, [props]);
  return (
    <canvas
      ref={canvas}
      width={props.output.width}
      height={props.output.height}
      // Participate in positioned paint order above the absolute background and below focus controls.
      className="relative block w-full"
    />
  );
}
