import { useEffect, useRef, useState } from 'react';
import {
  createReviewSpotlightMasks,
  reviewSpotlightNeedsClip,
  reviewSpotlightOpeningClip,
  type ReviewSpotlightClip,
} from '../../workflows/video-review/render-spotlight';
import {
  quickEditSpotlightPath,
  quickEditSpotlightOpeningPath,
  type QuickEditSpotlightFrame,
} from '../../features/video/review/advanced/focus';

/** Pixel clipping keeps the backdrop filter outside the opening, including in resized previews. */
function SingleSpotlightOverlay(props: {
  output: { width: number; height: number };
  frame: QuickEditSpotlightFrame | null;
  clip?: ReviewSpotlightClip | undefined;
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
  const bounds = reviewSpotlightNeedsClip(props.frame, props.clip)
    ? reviewSpotlightOpeningClip(props.frame, props.clip)
    : undefined;
  const svg = singleSpotlightSvg(output, frame, bounds, scale);
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

/** A clipped vector hole avoids a full-canvas readback and PNG encode on every animation tick. */
function singleSpotlightSvg(
  output: { width: number; height: number },
  frame: QuickEditSpotlightFrame,
  bounds: ReviewSpotlightClip | undefined,
  scale: number
) {
  const root = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${output.width} ${output.height}">`;
  if (!bounds)
    return (
      root +
      `<path fill="white" fill-rule="evenodd" d="${quickEditSpotlightPath(output, frame)}"/></svg>`
    );
  const rect = bounds.rect;
  return (
    root +
    `<defs><clipPath id="window"><rect x="${rect.x * scale}" y="${rect.y * scale}" ` +
    `width="${rect.width * scale}" height="${rect.height * scale}" rx="${bounds.radius * scale}"/></clipPath>` +
    `<mask id="outside" maskUnits="userSpaceOnUse" x="0" y="0" width="${output.width}" height="${output.height}">` +
    `<rect width="100%" height="100%" fill="white"/>` +
    `<path fill="black" d="${quickEditSpotlightOpeningPath(frame)}" clip-path="url(#window)"/>` +
    `</mask></defs><rect width="100%" height="100%" fill="white" mask="url(#outside)"/></svg>`
  );
}

/** Independent channel masks implement union, including mixed strengths and blur radii. */
export function ReviewSpotlightOverlay(props: {
  output: { width: number; height: number };
  frame?: QuickEditSpotlightFrame | null;
  frames?: readonly QuickEditSpotlightFrame[];
  clip?: ReviewSpotlightClip | undefined;
}) {
  const frames = props.frames ?? (props.frame ? [props.frame] : []);
  if (!frames.length) return null;
  if (frames.length === 1)
    return (
      <SingleSpotlightOverlay output={props.output} frame={frames[0] ?? null} clip={props.clip} />
    );
  return <CombinedSpotlightOverlay output={props.output} frames={frames} clip={props.clip} />;
}

function CombinedSpotlightOverlay(props: {
  output: { width: number; height: number };
  frames: readonly QuickEditSpotlightFrame[];
  clip?: ReviewSpotlightClip | undefined;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(props.output.width);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = () => setWidth(node.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  // Fresh transport samples have new object identities even while the mask is stationary.
  const key = JSON.stringify([props.output.width, props.output.height, props.frames, props.clip]);
  const cache = useRef<{
    key: string;
    masks: { dim: string; blur: string; radius: number };
  } | null>(null);
  if (cache.current?.key !== key) {
    const result = createReviewSpotlightMasks(props.output, props.frames, props.clip);
    cache.current = {
      key,
      masks: { dim: result.dim.toDataURL(), blur: result.blur.toDataURL(), radius: result.radius },
    };
  }
  const masks = cache.current.masks;
  const maskStyle = (url: string) => ({ maskImage: `url("${url}")`, maskSize: '100% 100%' });
  return (
    <div
      ref={ref}
      aria-hidden="true"
      data-ui="gallery.videoReview.spotlight"
      className="pointer-events-none absolute inset-0"
    >
      <div
        className="absolute inset-0"
        style={{
          ...maskStyle(masks.blur),
          backdropFilter:
            masks.radius > 0 ? `blur(${(masks.radius * width) / props.output.width}px)` : undefined,
        }}
      />
      <div className="absolute inset-0 bg-black" style={maskStyle(masks.dim)} />
    </div>
  );
}
