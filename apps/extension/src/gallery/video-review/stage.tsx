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
  const moving = useRef<ReviewRegion | null>(null);
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
  const nextRegion = (end: { x: number; y: number }) => {
    if (!start.current) return null;
    const original = moving.current;
    return original
      ? {
          ...original,
          x: Math.max(0, Math.min(1 - original.width, original.x + end.x - start.current.x)),
          y: Math.max(0, Math.min(1 - original.height, original.y + end.y - start.current.y)),
        }
      : regionFromPoints(start.current, end);
  };
  useEffect(() => {
    const cancel = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        start.current = null;
        moving.current = null;
        setDrag(null);
      }
    };
    window.addEventListener('keydown', cancel);
    return () => window.removeEventListener('keydown', cancel);
  }, []);
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
        moving.current = null;
        const target = event.target;
        const corner =
          target instanceof Element
            ? target.closest('[data-region-corner]')?.getAttribute('data-region-corner')
            : null;
        const point = start.current;
        if (point && props.region) {
          const region = props.region;
          if (corner === 'nw' || corner === 'ne' || corner === 'sw' || corner === 'se') {
            start.current = {
              x: corner.endsWith('w') ? region.x + region.width : region.x,
              y: corner.startsWith('n') ? region.y + region.height : region.y,
            };
          } else if (
            point.x >= region.x &&
            point.x <= region.x + region.width &&
            point.y >= region.y &&
            point.y <= region.y + region.height
          )
            moving.current = region;
        }
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
        if (end) setDrag(nextRegion(end));
      }}
      onPointerUp={(event) => {
        if (!start.current) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        const end = normalizeVideoPoint(
          { x: event.clientX - bounds.left, y: event.clientY - bounds.top },
          content,
          true
        );
        const next = end ? nextRegion(end) : null;
        start.current = null;
        moving.current = null;
        setDrag(null);
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId);
        if (next) props.onRegion(next);
      }}
      onPointerCancel={() => {
        start.current = null;
        moving.current = null;
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
          className={`${props.drawing ? 'cursor-move' : 'pointer-events-none'}
              absolute border-2 border-[var(--sniptale-color-accent)]
              bg-[color:color-mix(in_srgb,var(--sniptale-color-accent)_12%,transparent)]`}
          style={{
            left: projected.x,
            top: projected.y,
            width: projected.width,
            height: projected.height,
          }}
        >
          {props.drawing
            ? (['nw', 'ne', 'sw', 'se'] as const).map((corner) => (
                <span
                  key={corner}
                  data-region-corner={corner}
                  className="absolute h-2.5 w-2.5 rounded-sm border border-[var(--sniptale-color-accent)]
                      bg-[var(--sniptale-color-surface-panel)]"
                  style={{
                    left: corner.endsWith('w') ? -5 : undefined,
                    right: corner.endsWith('e') ? -5 : undefined,
                    top: corner.startsWith('n') ? -5 : undefined,
                    bottom: corner.startsWith('s') ? -5 : undefined,
                    cursor: corner === 'nw' || corner === 'se' ? 'nwse-resize' : 'nesw-resize',
                  }}
                />
              ))
            : null}
        </div>
      ) : null}
    </div>
  );
}
