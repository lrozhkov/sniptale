import { useEffect, useRef, useState } from 'react';
import type { QuickEditBackgroundSettings } from '../../features/video/review/advanced/types';
import { drawReviewBackgroundPaint } from '../../workflows/video-review/scene-background';

/** Static background shares export pixels; camera movement remains on its parent plane. */
export function ReviewBackgroundBlurPreview(props: {
  background: Extract<QuickEditBackgroundSettings, { enabled: true }>;
  imageUrl: string | undefined;
  width: number;
  height: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [loaded, setLoaded] = useState<{ url: string; image: HTMLImageElement } | null>(null);
  useEffect(() => {
    const url = props.imageUrl;
    if (!url) return;
    const image = new Image();
    image.onload = () => setLoaded({ url, image });
    image.src = url;
    return () => {
      image.onload = null;
    };
  }, [props.imageUrl]);
  useEffect(() => {
    const target = canvas.current;
    if (!target) return;
    const scale = Math.min(1, 2048 / Math.max(props.width, props.height));
    target.width = Math.max(1, Math.round(props.width * scale));
    target.height = Math.max(1, Math.round(props.height * scale));
    const context = target.getContext('2d');
    if (!context) return;
    const background = {
      ...props.background,
      layout: { ...props.background.layout, blur: (props.background.layout.blur ?? 0) * scale },
    };
    const draw = (image: HTMLImageElement | null) =>
      drawReviewBackgroundPaint(context, {
        background,
        image,
        width: target.width,
        height: target.height,
      });
    draw(
      props.background.type === 'image' && loaded && loaded.url === props.imageUrl
        ? loaded.image
        : null
    );
  }, [props.background, props.imageUrl, props.width, props.height, loaded]);
  return (
    <canvas
      ref={canvas}
      data-ui="gallery.videoReview.backgroundBlur"
      className="absolute inset-0 h-full w-full"
    />
  );
}
