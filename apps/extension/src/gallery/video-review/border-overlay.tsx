import { useEffect, useRef } from 'react';
import type { SceneBorderFrame } from '../../features/video/composition/scene-border';
import { drawSceneBorders } from '../../features/video/composition/draw/border';

/** Content strokes share export's path, dash phase, interval mask and clipping. */
export function ReviewBorderOverlay(props: {
  output: { width: number; height: number };
  frames: readonly SceneBorderFrame[];
  clip?: Parameters<typeof drawSceneBorders>[3];
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const context = ref.current?.getContext('2d');
    if (!context || !props.frames.length) return;
    context.clearRect(0, 0, props.output.width, props.output.height);
    drawSceneBorders(context, props.output, props.frames, props.clip);
  }, [props.output, props.frames, props.clip]);
  return props.frames.length ? (
    <canvas
      ref={ref}
      aria-hidden="true"
      data-ui="gallery.videoReview.border"
      width={props.output.width}
      height={props.output.height}
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  ) : null;
}
