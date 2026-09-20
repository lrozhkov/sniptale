import { useEffect, useRef, useState } from 'react';
import {
  quickEditSpotlightPath,
  type QuickEditSpotlightFrame,
} from '../../features/video/review/advanced/focus';

/** Pixel clipping keeps the backdrop filter outside the opening, including in resized previews. */
export function ReviewSpotlightOverlay(props: {
  output: { width: number; height: number };
  frame: QuickEditSpotlightFrame | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(props.output.width);
  const visible = !!props.frame;
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = () => setWidth(node.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [visible]);
  if (!props.frame) return null;
  const scale = width / props.output.width;
  const frame = {
    ...props.frame,
    radius: props.frame.radius * scale,
    opening: {
      x: props.frame.opening.x * scale,
      y: props.frame.opening.y * scale,
      width: props.frame.opening.width * scale,
      height: props.frame.opening.height * scale,
    },
  };
  const output = { width, height: props.output.height * scale };
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${output.width} ${output.height}">` +
    `<path fill="white" fill-rule="evenodd" d="${quickEditSpotlightPath(output, frame)}"/></svg>`;
  return (
    <div
      ref={ref}
      aria-hidden="true"
      data-ui="gallery.videoReview.spotlight"
      className="pointer-events-none absolute inset-0"
      style={{
        maskImage: `url("data:image/svg+xml,${encodeURIComponent(svg)}")`,
        maskSize: '100% 100%',
        background: `rgba(0,0,0,${frame.dim})`,
        backdropFilter: frame.blur > 0 ? `blur(${frame.blur * scale}px)` : undefined,
      }}
    />
  );
}
