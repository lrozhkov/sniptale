import { useEffect, useRef, useState } from 'react';
import type { QuickEditBackgroundSettings } from '../../features/video/review/advanced/types';
import { drawReviewBackgroundPaint } from '../../workflows/video-review/scene-background';
import { hasSceneBackgroundMotion } from '../../features/video/project/scene/background-motion';
import { releaseSceneBackgroundMotionRaster } from '../../features/video/project/scene/background-motion-canvas';

/** Background paint shares export pixels; camera movement remains on its parent plane. */
export function ReviewBackgroundBlurPreview(props: {
  background: Extract<QuickEditBackgroundSettings, { enabled: true }>;
  imageUrl: string | undefined;
  width: number;
  height: number;
  currentTime?: number | undefined;
  getCurrentTime?: (() => number) | undefined;
  playing?: boolean | undefined;
}) {
  const {
    background: sourceBackground,
    imageUrl,
    width: sourceWidth,
    height: sourceHeight,
    currentTime,
    getCurrentTime,
    playing,
  } = props;
  const canvas = useRef<HTMLCanvasElement>(null);
  const [loaded, setLoaded] = useState<{ url: string; image: HTMLImageElement } | null>(null);
  useEffect(() => {
    const url = imageUrl;
    if (!url) return;
    const image = new Image();
    image.onload = () => setLoaded({ url, image });
    image.src = url;
    return () => {
      image.onload = null;
    };
  }, [imageUrl]);
  useEffect(() => {
    const target = canvas.current;
    if (!target) return;
    const scale = Math.min(1, 2048 / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    if (target.width !== width) target.width = width;
    if (target.height !== height) target.height = height;
    const context = target.getContext('2d');
    if (!context) return;
    const background = {
      ...sourceBackground,
      layout: { ...sourceBackground.layout, blur: (sourceBackground.layout.blur ?? 0) * scale },
    };
    const draw = (image: HTMLImageElement | null) => {
      drawReviewBackgroundPaint(context, {
        currentTime: getCurrentTime?.() ?? currentTime ?? 0,
        background,
        image,
        width: target.width,
        height: target.height,
      });
    };
    const paint = () =>
      draw(
        sourceBackground.type === 'image' && loaded && loaded.url === imageUrl ? loaded.image : null
      );
    paint();
    if (!playing || !hasSceneBackgroundMotion(sourceBackground.motion)) return;
    let request: number;
    const tick = () => {
      paint();
      request = requestAnimationFrame(tick);
    };
    request = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(request);
  }, [
    sourceBackground,
    imageUrl,
    sourceWidth,
    sourceHeight,
    currentTime,
    getCurrentTime,
    playing,
    loaded,
  ]);
  useEffect(() => {
    const context = canvas.current?.getContext('2d');
    return () => {
      if (context) releaseSceneBackgroundMotionRaster(context);
    };
  }, []);
  return (
    <canvas
      ref={canvas}
      data-ui="gallery.videoReview.backgroundBlur"
      className="absolute inset-0 h-full w-full"
    />
  );
}

/** Background moves as its own scene plane, below all content overlays. */
export function ReviewStageBackground({
  background,
  sceneSize,
  imageUrl,
  motion,
  paint,
  currentTime,
  getCurrentTime,
  playing,
}: {
  background: QuickEditBackgroundSettings | undefined;
  sceneSize: { width: number; height: number };
  imageUrl: string | undefined;
  motion: { x: number; y: number; backgroundScale: number };
  paint: string | null;
  currentTime?: number | undefined;
  getCurrentTime?: (() => number) | undefined;
  playing?: boolean | undefined;
}) {
  const blurred =
    background?.enabled && background.type !== 'solid' && (background.layout.blur ?? 0) > 0;
  const animated =
    background?.enabled &&
    background.type !== 'solid' &&
    hasSceneBackgroundMotion(background.motion);
  return (
    <div
      data-ui="gallery.videoReview.backgroundPlane"
      className="pointer-events-none absolute inset-0"
      style={{
        background: paint ?? undefined,
        transformOrigin: '0 0',
        transform: `translate3d(${motion.x}px, ${motion.y}px, 0) scale(${motion.backgroundScale})`,
      }}
    >
      {background?.enabled && (blurred || animated) ? (
        <ReviewBackgroundBlurPreview
          background={background}
          imageUrl={imageUrl}
          width={sceneSize.width}
          height={sceneSize.height}
          currentTime={currentTime}
          getCurrentTime={getCurrentTime}
          playing={playing}
        />
      ) : imageUrl && background?.enabled && background.type === 'image' ? (
        <img
          src={imageUrl}
          alt=""
          className="pointer-events-none absolute inset-0 h-full w-full"
          style={{ objectFit: background.imageFit }}
        />
      ) : null}
    </div>
  );
}
