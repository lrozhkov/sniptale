import { useZoomPreviewCanvasPaint } from './zoom-preview-canvas';
import {
  quickEditMotionBlurCameras,
  sameQuickEditCamera,
} from '../../features/video/review/advanced/motion-blur';
import { evaluateQuickEditCameraAtTime } from '../../features/video/review/advanced/scene';
import { ReviewMotionBlurPreview } from './motion-blur-preview';
import { useRef, useState } from 'react';
import { ReviewRegionFocusArea } from './region-focus-area';
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
import { previewBackgroundPaint, type ZoomPreviewLayout } from './zoom-preview-paint';
import type { ZoomPreviewFrame } from './use-zoom-preview-source';
import { ReviewSpotlightOverlay } from './spotlight-overlay';
import { ReviewBorderOverlay } from './border-overlay';
import { type SceneSpotlightLayer } from '../../features/video/composition/draw/spotlight';

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
  onPaintReady?: ((ready: boolean) => void) | undefined;
  onChange(value: QuickEditZoomRegionPatch): void;
  onPreview?: ((value: QuickEditZoomRegionPatch | null) => void) | undefined;
}) {
  const [gpuActive, setGpuActive] = useState(
    () => typeof navigator !== 'undefined' && !!navigator.gpu
  );
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
  const spotlights = evaluateQuickEditSpotlightsAtTime(args);
  const clip = { rect: motion.windowClip, radius: props.cornerRadius * motion.scale };
  return (
    <div className="relative">
      {!gpuActive ? (
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
      ) : null}
      <SpotlightSourceFrame
        {...props}
        lensFrames={spotlights.filter((frame) => frame.lens).map((frame) => ({ ...frame, clip }))}
        spotlightFrames={spotlights.map((frame) => ({ ...frame, clip }))}
        borderFrames={evaluateQuickEditBordersAtTime(args)}
        currentTime={args.time}
        onBackend={setGpuActive}
      />
      {!gpuActive && !framing ? (
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
      {!gpuActive ? (
        <ReviewSpotlightOverlay
          output={props.output}
          frames={spotlights.filter((frame) => frame.dim > 0 || frame.blur > 0)}
          clip={clip}
        />
      ) : null}
      {!gpuActive ? (
        <ReviewBorderOverlay
          output={props.output}
          frames={evaluateQuickEditBordersAtTime(args)}
          clip={{ rect: motion.windowClip, radius: props.cornerRadius * motion.scale }}
        />
      ) : null}
      {overlay && framing ? (
        <ReviewRegionFocusArea
          alwaysVisible
          region={props.region}
          output={props.output}
          video={args.video}
          disabled={props.disabled}
          onChange={props.onChange}
          onPreview={(patch) => {
            setDraft(patch?.spotlight?.area ?? patch?.border?.area ?? null);
            props.onPreview?.(patch);
          }}
        />
      ) : null}
    </div>
  );
}

/** Inspector overlay framing uses the same bounded GPU source owner as camera framing. */
function SpotlightSourceFrame(
  props: Parameters<typeof ReviewSpotlightPreview>[0] & {
    lensFrames: readonly SceneSpotlightLayer[];
    spotlightFrames: readonly SceneSpotlightLayer[];
    borderFrames: ReturnType<typeof evaluateQuickEditBordersAtTime>;
    currentTime: number;
    onBackend(gpu: boolean): void;
  }
) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const evaluated = props.focus
    ? evaluateQuickEditCameraAtTime(props.focus.regions, props.focus.time)
    : null;
  const exposures =
    props.focus && evaluated && sameQuickEditCamera(props.camera, evaluated)
      ? quickEditMotionBlurCameras(props.focus.regions, props.focus.time)
      : undefined;
  useZoomPreviewCanvasPaint(canvas, {
    ...props,
    background: props.background ?? { enabled: false },
    imageUrl: props.imageUrl ?? null,
    previewScale: props.scale,
    view: 'result',
    exposures,
    authoringRevision: JSON.stringify([
      props.region.id,
      props.region.transform,
      props.region.spotlight,
      props.region.border,
      props.region.perspective,
      props.region.depthOfField,
      props.region.motionBlur,
    ]),
  });
  return (
    <canvas
      ref={canvas}
      width={props.output.width}
      height={props.output.height}
      data-ui="gallery.videoReview.spotlightFrame"
      className="relative block w-full"
    />
  );
}
