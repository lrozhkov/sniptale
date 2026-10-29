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
  const painted = useRef<{ canvas: HTMLCanvasElement; key: string } | null>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !props.frames.length) return;
    const key = JSON.stringify([props.output, props.frames, props.clip]);
    if (painted.current?.canvas === canvas && painted.current.key === key) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.clearRect(0, 0, props.output.width, props.output.height);
    drawSceneBorders(context, props.output, props.frames, props.clip);
    painted.current = { canvas, key };
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
