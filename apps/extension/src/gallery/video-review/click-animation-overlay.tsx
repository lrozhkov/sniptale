import { useEffect, useRef } from 'react';
import { drawReviewClicks } from '../../workflows/video-review/render-click-animation';
import {
  evaluateReviewClicks,
  type ReviewClickCue,
} from '../../features/video/review/click-animation';

/** Live canvas shares the exact phase evaluator and painter with rendered exports. */
export function ReviewClickOverlay(props: {
  cues?: readonly ReviewClickCue[] | undefined;
  time: number;
  output: { width: number; height: number };
  video: Parameters<typeof drawReviewClicks>[2] | undefined;
  sourceWidth: number;
  clip: Parameters<typeof drawReviewClicks>[4] | undefined;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const frames = evaluateReviewClicks(props.cues ?? [], props.time);
  useEffect(() => {
    const context = canvas.current?.getContext('2d');
    if (!context || !props.video || !props.clip) return;
    context.clearRect(0, 0, props.output.width, props.output.height);
    drawReviewClicks(context, frames, props.video, props.sourceWidth, props.clip);
  }, [frames, props.output, props.video, props.sourceWidth, props.clip]);
  return frames.length && props.video && props.clip ? (
    <canvas
      ref={canvas}
      aria-hidden="true"
      data-ui="gallery.videoReview.clickAnimation"
      width={props.output.width}
      height={props.output.height}
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  ) : null;
}
