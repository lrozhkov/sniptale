import { useEffect, useRef, useState, type RefObject } from 'react';
import { translate } from '../../platform/i18n';
import {
  fitVideoRect,
  normalizeVideoPoint,
  projectVideoRegion,
  regionFromPoints,
} from '../../features/video/review/geometry';
import type { ReviewRegion, ReviewSource } from '../../features/video/review/types';

/** Draws in the oriented image plane, never in the player's letterbox margins. */
export function ReviewStage(props: {
  url: string;
  source: ReviewSource;
  video: RefObject<HTMLVideoElement | null>;
  drawing: boolean;
  region: ReviewRegion | undefined;
  onRegion(value: ReviewRegion): void;
  onReady(): void;
  onTime(time: number): void;
  onPlaying(value: boolean): void;
  onError(): void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const [size, setSize] = useState({ width: 1, height: 1 });
  const [drag, setDrag] = useState<ReviewRegion | null>(null);
  useEffect(() => {
    const node = host.current;
    if (!node) return;
    const measure = () =>
      setSize({ width: Math.max(1, node.clientWidth), height: Math.max(1, node.clientHeight) });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!props.drawing) {
      start.current = null;
      setDrag(null);
    }
  }, [props.drawing]);
  const content = fitVideoRect(size, props.source);
  const region = drag ?? props.region;
  const projected = region ? projectVideoRegion(region, content) : null;
  return (
    <div
      ref={host}
      data-ui="gallery.videoReview.stage"
      className="relative min-h-36 flex-1 overflow-hidden rounded-[var(--sniptale-radius-sm)] bg-black"
      style={{
        cursor: props.drawing ? 'crosshair' : 'default',
        touchAction: props.drawing ? 'none' : 'auto',
      }}
      onPointerDown={(event) => {
        if (!props.drawing || event.button !== 0) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        start.current = normalizeVideoPoint(
          { x: event.clientX - bounds.left, y: event.clientY - bounds.top },
          content
        );
        if (start.current) {
          event.currentTarget.setPointerCapture(event.pointerId);
          props.video.current?.pause();
        }
      }}
      onPointerMove={(event) => {
        if (!start.current) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        const end = normalizeVideoPoint(
          { x: event.clientX - bounds.left, y: event.clientY - bounds.top },
          content,
          true
        );
        if (end) setDrag(regionFromPoints(start.current, end));
      }}
      onPointerUp={(event) => {
        if (!start.current) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        const end = normalizeVideoPoint(
          { x: event.clientX - bounds.left, y: event.clientY - bounds.top },
          content,
          true
        );
        const next = end ? regionFromPoints(start.current, end) : null;
        start.current = null;
        setDrag(null);
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId);
        if (next) props.onRegion(next);
      }}
      onPointerCancel={() => {
        start.current = null;
        setDrag(null);
      }}
    >
      <video
        ref={props.video}
        src={props.url}
        controls={false}
        playsInline
        preload="metadata"
        className="pointer-events-none absolute inset-0 h-full w-full object-contain"
        onLoadedMetadata={props.onReady}
        onTimeUpdate={(event) => props.onTime(event.currentTarget.currentTime)}
        onPlay={() => props.onPlaying(true)}
        onPause={() => props.onPlaying(false)}
        onEnded={() => props.onPlaying(false)}
        onError={props.onError}
      />
      {projected ? (
        <div
          aria-label={translate('gallery.videoReview.selectedRegion')}
          className="pointer-events-none absolute border-2 border-[var(--sniptale-color-accent)]
          bg-[color:color-mix(in_srgb,var(--sniptale-color-accent)_12%,transparent)]"
          style={{
            left: projected.x,
            top: projected.y,
            width: projected.width,
            height: projected.height,
          }}
        />
      ) : null}
    </div>
  );
}
