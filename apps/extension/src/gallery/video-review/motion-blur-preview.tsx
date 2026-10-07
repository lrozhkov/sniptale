import { ReviewButton } from './controls';
import { createReviewSpatialRenderer } from '../../workflows/video-review/spatial-renderer';
import { translate } from '../../platform/i18n';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  hasQuickEditMotionBlur,
  quickEditMotionBlurCameras,
  sameQuickEditCamera,
} from '../../features/video/review/advanced/motion-blur';
import {
  evaluateQuickEditCameraAtTime,
  type computeQuickEditSceneLayout,
} from '../../features/video/review/advanced/scene';
import type {
  QuickEditBackgroundSettings,
  QuickEditCameraTransform,
  QuickEditZoomRegion,
} from '../../features/video/review/advanced/types';
import { drawReviewSceneFrame } from '../../workflows/video-review/scene-frame';

type Props = {
  /** Target mini-preview already paints its spatial base; only temporal exposure adds a pass. */
  hasSpatialBase?: boolean;
  focus?: { regions: readonly QuickEditZoomRegion[]; time: number } | undefined;
  camera: QuickEditCameraTransform;
  layout: ReturnType<typeof computeQuickEditSceneLayout>;
  output: { width: number; height: number };
  background: QuickEditBackgroundSettings;
  imageUrl?: string | null | undefined;
  headerImage?: CanvasImageSource | null | undefined;
  sceneScale: number;
  getFrame(): CanvasImageSource | null;
};

/** The native player remains mounted; only moving camera exposure uses a composited raster. */
export function ReviewMotionBlurPreview(props: Props) {
  const focus = props.focus;
  const enabled = useMemo(() => hasQuickEditMotionBlur(focus?.regions ?? []), [focus?.regions]);
  if (
    (!enabled && !props.camera.spatial) ||
    !focus ||
    !sameQuickEditCamera(props.camera, evaluateQuickEditCameraAtTime(focus.regions, focus.time))
  )
    return null;
  const passes = quickEditMotionBlurCameras(focus.regions, focus.time);
  return passes.length > 1 || (props.camera.spatial && !props.hasSpatialBase) ? (
    <MotionBlurCanvas {...props} passes={passes} />
  ) : null;
}

function MotionBlurCanvas(
  props: Props & { passes: ReturnType<typeof quickEditMotionBlurCameras> }
) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const renderer = useRef<ReturnType<typeof createReviewSpatialRenderer> | null>(null);
  const spatialEnabled = !!props.camera.spatial;
  useLayoutEffect(() => {
    if (!spatialEnabled) {
      setFailed(false);
      return;
    }
    try {
      renderer.current = createReviewSpatialRenderer(() => setFailed(true));
      setFailed(false);
    } catch {
      setFailed(true);
    }
    return () => {
      renderer.current?.dispose();
      renderer.current = null;
    };
  }, [spatialEnabled, retry]);
  const [loaded, setLoaded] = useState<{ url: string; image: HTMLImageElement } | null>(null);
  useEffect(() => {
    if (!props.imageUrl) return;
    const image = new Image();
    const url = props.imageUrl;
    let current = true;
    image.onload = () => {
      if (current) setLoaded({ url, image });
    };
    image.src = url;
    return () => {
      current = false;
      image.onload = null;
    };
  }, [props.imageUrl]);
  useLayoutEffect(() => {
    const node = canvas.current;
    const context = node?.getContext('2d');
    if (!node || !context) return;
    const paint = () => {
      const frame = props.getFrame();
      const image = loaded && loaded.url === props.imageUrl ? loaded.image : null;
      const pending =
        !frame ||
        (frame instanceof HTMLVideoElement && frame.readyState < 2) ||
        (props.background.enabled && props.background.type === 'image' && !image);
      node.style.visibility = pending ? 'hidden' : 'visible';
      if (pending || !frame) return;
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      try {
        drawReviewSceneFrame(context, {
          spatialRenderer: renderer.current ?? undefined,
          canvas: props.output,
          layout: props.layout,
          background: props.background.enabled
            ? {
                ...props.background,
                layout: {
                  ...props.background.layout,
                  cornerRadius: props.background.layout.cornerRadius * props.sceneScale,
                },
              }
            : props.background,
          image,
          headerImage: props.headerImage,
          sample: {
            draw: (target, x, y, width, height) => target.drawImage(frame, x, y, width, height),
          },
          sceneScale: props.sceneScale,
          motionBlur: props.passes,
        });
      } catch {
        setFailed(true);
        node.style.visibility = 'hidden';
      }
    };
    paint();
    const frame = props.getFrame();
    if (!(frame instanceof HTMLVideoElement)) return;
    frame.addEventListener('loadeddata', paint);
    frame.addEventListener('seeked', paint);
    return () => {
      frame.removeEventListener('loadeddata', paint);
      frame.removeEventListener('seeked', paint);
    };
  }, [props, loaded, retry]);
  return (
    <>
      {failed ? (
        <div
          role="alert"
          className="absolute inset-0 z-20 flex items-center justify-center
          bg-[var(--sniptale-color-surface-panel)] p-3 text-sm"
        >
          <span>{translate('gallery.videoReview.spatialUnavailable')}</span>
          <ReviewButton
            label={translate('gallery.videoReview.retry')}
            onClick={() => setRetry((v) => v + 1)}
          />
        </div>
      ) : null}
      <canvas
        ref={canvas}
        width={Math.max(1, Math.round(props.output.width))}
        height={Math.max(1, Math.round(props.output.height))}
        data-ui="gallery.videoReview.motionBlurCanvas"
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full"
      />
    </>
  );
}
