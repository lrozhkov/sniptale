import { useEffect, useRef } from 'react';
import { drawReviewClicks } from '../../workflows/video-review/render-click-animation';
import {
  evaluateReviewClicks,
  type ReviewClickCue,
} from '../../features/video/review/click-animation';
import {
  withReviewWindowRaster,
  reviewWindowRasterBacking,
} from '../../workflows/video-review/window-header';

/** Live canvas shares the exact phase evaluator and painter with rendered exports. */
export function ReviewClickOverlay(props: {
  cues?: readonly ReviewClickCue[] | undefined;
  time: number;
  output: { width: number; height: number };
  video: Parameters<typeof drawReviewClicks>[2] | undefined;
  sourceWidth: number;
  headerImage?: CanvasImageSource | null | undefined;
  window?:
    | {
        videoRect: Parameters<typeof drawReviewClicks>[2];
        windowRect: Parameters<typeof drawReviewClicks>[2];
        transform?: Parameters<typeof drawReviewClicks>[2];
      }
    | undefined;
  transform?: { scale: number; x: number; y: number } | undefined;
  getFrame?(): CanvasImageSource | null;
  clip: Parameters<typeof drawReviewClicks>[4] | undefined;
}) {
  const { getFrame, transform: mapping } = props;
  const canvas = useRef<HTMLCanvasElement>(null);
  const frames = evaluateReviewClicks(props.cues ?? [], props.time);
  useEffect(() => {
    const context = canvas.current?.getContext('2d');
    if (!context || !props.video || !props.clip) return;
    const paint = () => {
      context.clearRect(0, 0, props.output.width, props.output.height);
      const candidate = getFrame?.();
      const frame =
        candidate instanceof HTMLVideoElement && candidate.readyState < 2 ? null : candidate;
      const draw = (source?: Parameters<typeof drawReviewClicks>[5]) =>
        drawReviewClicks(context, frames, props.video!, props.sourceWidth, props.clip!, source);
      const magnify = frames.some((click) => (click.lens?.scale ?? 1) > 1);
      if (frame && props.headerImage && props.window && magnify) {
        const window = props.window;
        withReviewWindowRaster(
          {
            header: props.headerImage,
            videoRect: window.videoRect,
            windowRect: window.windowRect,
            backing: reviewWindowRasterBacking({
              windowRect: window.windowRect,
              sourceWidth: props.sourceWidth,
              magnify,
            }),
            draw: (target, x, y, width, height) => target.drawImage(frame, x, y, width, height),
          },
          (raster) =>
            draw({
              rect: window.transform ?? window.windowRect,
              draw: (target, x, y, width, height) =>
                target.drawImage(
                  raster.image,
                  0,
                  0,
                  raster.width,
                  raster.height,
                  x,
                  y,
                  width,
                  height
                ),
            })
        );
      } else
        draw(
          frame
            ? {
                rect: props.video!,
                draw: (target, x, y, width, height) => target.drawImage(frame, x, y, width, height),
              }
            : undefined
        );
    };
    paint();
    const source = getFrame?.();
    if (!(source instanceof HTMLVideoElement) || !frames.some((frame) => frame.lens)) return;
    // A paused seek publishes its time before the decoder presents the target frame.
    // Its completion may not cause another React render at that same time.
    const events = ['loadeddata', 'seeked', 'timeupdate'] as const;
    for (const event of events) source.addEventListener(event, paint);
    return () => {
      for (const event of events) source.removeEventListener(event, paint);
    };
  }, [
    frames,
    props.output,
    props.video,
    props.sourceWidth,
    props.clip,
    props.headerImage,
    props.window,
    getFrame,
  ]);
  return frames.length && props.video && props.clip ? (
    <canvas
      ref={canvas}
      aria-hidden="true"
      data-ui="gallery.videoReview.clickAnimation"
      width={props.output.width}
      height={props.output.height}
      style={
        mapping
          ? {
              transformOrigin: '0 0',
              transform: `matrix(${mapping.scale}, 0, 0, ${mapping.scale}, ${mapping.x}, ${mapping.y})`,
            }
          : undefined
      }
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  ) : null;
}
