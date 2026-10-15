import { useEffect, useRef } from 'react';
import { drawReviewKeys } from '../../workflows/video-review/render-key-animation';
import type { ReviewKeyCue } from '../../features/video/review/key-animation';

/** Viewport captions remain independent of the source camera and spatial projection. */
export function ReviewKeyOverlay(props: {
  cues?: readonly ReviewKeyCue[] | undefined;
  time: number;
  output: { width: number; height: number };
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const context = canvas.current?.getContext('2d');
    if (!context) return;
    context.clearRect(0, 0, props.output.width, props.output.height);
    drawReviewKeys(context, props.cues ?? [], props.time, props.output);
  }, [props.cues, props.time, props.output]);
  return (
    <canvas
      ref={canvas}
      aria-hidden="true"
      data-ui="gallery.videoReview.keyAnimation"
      width={props.output.width}
      height={props.output.height}
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  );
}
