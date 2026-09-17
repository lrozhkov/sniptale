import { useEffect, useRef, useState, type RefObject } from 'react';
import { translate } from '../../platform/i18n';
import { fitVideoRect, projectVideoRegion } from '../../features/video/review/geometry';
import { serializePaintToCss } from '@sniptale/foundation/paint';
import type { ReviewRegion, ReviewSource } from '../../features/video/review/types';
import {
  computeQuickEditSceneLayout,
  quickEditCanvasPointToContent,
} from '../../features/video/review/advanced/scene';
import type {
  QuickEditBackgroundSettings,
  QuickEditCameraTransform,
} from '../../features/video/review/advanced/types';
import { useReviewDrawingPlane } from './stage-drawing';

/** Draws in the oriented image plane, never in the player's letterbox margins. */
export function ReviewStage(props: {
  url: string;
  source: ReviewSource;
  video: RefObject<HTMLVideoElement | null>;
  drawing: boolean;
  region: ReviewRegion | undefined;
  zoom?: {
    camera: QuickEditCameraTransform;
    background: QuickEditBackgroundSettings;
    onDrag(point: { x: number; y: number }): void;
  };
  onRegion(value: ReviewRegion): void;
  onReady(): void;
  onTime(time: number): void;
  onPlaying(value: boolean): void;
  onError(): void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const zoomDrag = useRef<{ origin: { x: number; y: number }; pointerId: number } | null>(null);
  const [size, setSize] = useState({ width: 1, height: 1 });
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
    const cancel = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && zoomDrag.current) {
        const origin = zoomDrag.current.origin;
        zoomDrag.current = null;
        props.zoom?.onDrag(origin);
      }
    };
    window.addEventListener('keydown', cancel);
    return () => window.removeEventListener('keydown', cancel);
  });
  const zoomLayout = props.zoom
    ? computeQuickEditSceneLayout({
        output: size,
        source: props.source,
        background: props.zoom.background,
        camera: props.zoom.camera,
      })
    : null;
  const backgroundPaint = props.zoom?.background.enabled
    ? backgroundPaintOf(props.zoom.background)
    : null;
  const content = zoomLayout ? zoomLayout.videoRect : fitVideoRect(size, props.source);
  const plane = useReviewDrawingPlane({
    drawing: props.drawing,
    content,
    region: props.region,
    onRegion: props.onRegion,
    pause: () => props.video.current?.pause(),
  });
  const projected = plane.drag
    ? projectVideoRegion(plane.drag, content)
    : props.region
      ? projectVideoRegion(props.region, content)
      : null;
  const zoomFocus = zoomLayout
    ? {
        x:
          zoomLayout.videoTransform.x +
          props.zoom!.camera.centerX * zoomLayout.videoTransform.width,
        y:
          zoomLayout.videoTransform.y +
          props.zoom!.camera.centerY * zoomLayout.videoTransform.height,
      }
    : null;
  return (
    <div
      ref={host}
      data-ui="gallery.videoReview.stage"
      className="relative min-h-36 flex-1 overflow-hidden rounded-[var(--sniptale-radius-sm)] bg-black"
      style={{
        cursor: props.drawing ? 'crosshair' : 'default',
        touchAction: props.drawing ? 'none' : 'auto',
        ...(backgroundPaint && props.zoom?.background.enabled
          ? {
              background: backgroundPaint,
              borderRadius: props.zoom.background.layout.cornerRadius,
            }
          : {}),
      }}
      onPointerDown={plane.onPointerDown}
      onPointerMove={plane.onPointerMove}
      onPointerUp={plane.onPointerUp}
      onPointerCancel={plane.onPointerCancel}
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
      {projected ? <ReviewRegionOverlay drawing={props.drawing} projected={projected} /> : null}
      {zoomFocus && props.zoom && zoomLayout ? (
        <ReviewZoomTarget
          focus={zoomFocus}
          camera={props.zoom.camera}
          videoTransform={zoomLayout.videoTransform}
          onDrag={props.zoom.onDrag}
          zoomDrag={zoomDrag}
        />
      ) : null}
    </div>
  );
}

function ReviewRegionOverlay(props: { drawing: boolean; projected: ReviewRegion }) {
  return (
    <div
      aria-label={translate('gallery.videoReview.selectedRegion')}
      className={`${props.drawing ? 'cursor-move' : 'pointer-events-none'}
          absolute border-2 border-[var(--sniptale-color-accent)]
          bg-[color:color-mix(in_srgb,var(--sniptale-color-accent)_12%,transparent)]`}
      style={{
        left: props.projected.x,
        top: props.projected.y,
        width: props.projected.width,
        height: props.projected.height,
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
  );
}

function backgroundPaintOf(background: {
  type: 'solid' | 'gradient' | 'image';
  color?: string;
  gradient?: import('@sniptale/foundation/paint').Gradient;
}): string {
  if (background.type === 'solid' && background.color) return background.color;
  if (background.type === 'gradient' && background.gradient)
    return serializePaintToCss({ kind: 'gradient', gradient: background.gradient });
  return '#000000';
}

/** Draggable camera focus: the handle maps canvas movement into normalized content points. */
function ReviewZoomTarget(props: {
  focus: { x: number; y: number };
  camera: QuickEditCameraTransform;
  videoTransform: { x: number; y: number; width: number; height: number };
  onDrag(point: { x: number; y: number }): void;
  zoomDrag: React.RefObject<{ origin: { x: number; y: number }; pointerId: number } | null>;
}) {
  return (
    <div
      data-ui="gallery.videoReview.zoomTarget"
      role="slider"
      aria-label={translate('gallery.videoReview.zoomStageTarget')}
      aria-valuemin={0}
      aria-valuemax={1}
      aria-valuenow={props.camera.centerX}
      className="absolute z-10 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 cursor-move
          items-center justify-center rounded-full border-2
          border-[var(--sniptale-color-accent)] bg-[var(--sniptale-color-accent-soft)]"
      style={{ left: props.focus.x, top: props.focus.y }}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.stopPropagation();
        props.zoomDrag.current = {
          origin: { x: props.camera.centerX, y: props.camera.centerY },
          pointerId: event.pointerId,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (!props.zoomDrag.current) return;
        const bounds = event.currentTarget.parentElement!.getBoundingClientRect();
        const content = quickEditCanvasPointToContent(
          { x: event.clientX - bounds.left, y: event.clientY - bounds.top },
          props.videoTransform
        );
        if (content) props.onDrag(content);
      }}
      onPointerUp={(event) => {
        if (!props.zoomDrag.current) return;
        props.zoomDrag.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => {
        props.zoomDrag.current = null;
      }}
    />
  );
}
