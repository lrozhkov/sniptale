import { useEffect, useRef, useState } from 'react';
import { translate } from '../../platform/i18n';
import {
  clampQuickEditSpotlightArea,
  evaluateQuickEditSpotlightAtTime,
} from '../../features/video/review/advanced/focus';
import type {
  QuickEditSpotlight,
  QuickEditZoomRegion,
} from '../../features/video/review/advanced/types';
import { paintZoomPreview, type ZoomPreviewLayout } from './zoom-preview-paint';
import type { ZoomPreviewFrame } from './use-zoom-preview-source';
import { ReviewSpotlightOverlay } from './spotlight-overlay';

/** Local drag drafts commit once; cancellation leaves history unchanged. */
export function ReviewSpotlightPreview(props: {
  region: QuickEditZoomRegion;
  spotlight: QuickEditSpotlight;
  frame: ZoomPreviewFrame | null;
  output: { width: number; height: number };
  layout: ZoomPreviewLayout;
  cornerRadius: number;
  scale: number;
  disabled: boolean;
  onChange(value: QuickEditSpotlight): void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    id: number;
    x: number;
    y: number;
    resize: boolean;
    area: QuickEditSpotlight['area'];
  } | null>(null);
  const [draft, setDraft] = useState<QuickEditSpotlight['area'] | null>(null);
  const value = { ...props.spotlight, area: draft ?? props.spotlight.area };
  const region = {
    ...props.region,
    spotlight: value,
    enter: { type: 'none' as const, duration: 0 },
    exit: { type: 'none' as const, duration: 0 },
  };
  const mask = evaluateQuickEditSpotlightAtTime({
    regions: [region],
    time: region.start,
    output: props.output,
    video: props.layout.videoRect,
    scale: props.scale,
  });
  const cancel = () => {
    drag.current = null;
    setDraft(null);
  };
  return (
    <div
      ref={host}
      className="relative"
      style={{ touchAction: 'none' }}
      onPointerMove={(event) => {
        const active = drag.current;
        const bounds = host.current?.getBoundingClientRect();
        if (!active || active.id !== event.pointerId || !bounds) return;
        const dx =
          ((event.clientX - active.x) * props.output.width) /
          bounds.width /
          props.layout.videoRect.width;
        const dy =
          ((event.clientY - active.y) * props.output.height) /
          bounds.height /
          props.layout.videoRect.height;
        setDraft(
          clampQuickEditSpotlightArea(
            active.resize
              ? {
                  ...active.area,
                  width: Math.min(1 - active.area.x, active.area.width + dx),
                  height: Math.min(1 - active.area.y, active.area.height + dy),
                }
              : { ...active.area, x: active.area.x + dx, y: active.area.y + dy }
          )
        );
      }}
      onPointerUp={(event) => {
        if (drag.current?.id !== event.pointerId) return;
        if (draft) props.onChange({ ...props.spotlight, area: draft });
        cancel();
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={cancel}
      onLostPointerCapture={cancel}
    >
      <SpotlightSourceFrame
        frame={props.frame}
        output={props.output}
        layout={props.layout}
        cornerRadius={props.cornerRadius}
      />
      <ReviewSpotlightOverlay output={props.output} frame={mask} />
      {mask ? (
        <div
          role="group"
          tabIndex={props.disabled ? -1 : 0}
          aria-label={translate('gallery.videoReview.focusSpotlight')}
          title={translate('gallery.videoReview.focusAreaHint')}
          className="absolute cursor-move border border-[var(--sniptale-color-accent)] outline-none
        focus-visible:ring-1 focus-visible:ring-[var(--sniptale-color-accent)]"
          style={{
            left: `${(mask.opening.x / props.output.width) * 100}%`,
            top: `${(mask.opening.y / props.output.height) * 100}%`,
            width: `${(mask.opening.width / props.output.width) * 100}%`,
            height: `${(mask.opening.height / props.output.height) * 100}%`,
          }}
          onPointerDown={(event) => {
            if (props.disabled || event.button !== 0) return;
            event.preventDefault();
            event.stopPropagation();
            event.currentTarget.focus();
            drag.current = {
              id: event.pointerId,
              x: event.clientX,
              y: event.clientY,
              area: props.spotlight.area,
              resize: event.target instanceof Element && !!event.target.closest('[data-resize]'),
            };
            host.current?.setPointerCapture(event.pointerId);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation();
              cancel();
              return;
            }
            if (
              props.disabled ||
              !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)
            )
              return;
            event.preventDefault();
            event.stopPropagation();
            const step = event.shiftKey ? 0.1 : 0.01;
            props.onChange({
              ...props.spotlight,
              area: clampQuickEditSpotlightArea({
                ...value.area,
                x:
                  value.area.x +
                  (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0),
                y:
                  value.area.y +
                  (event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0),
              }),
            });
          }}
        >
          <span
            data-resize
            className="absolute -bottom-1 -right-1 h-3 w-3 cursor-se-resize rounded-sm
        border border-white bg-[var(--sniptale-color-accent)]"
          />
        </div>
      ) : null}
    </div>
  );
}

/** Source frame painting has its own frame/geometry lifecycle, separate from area gestures. */
function SpotlightSourceFrame(props: {
  frame: ZoomPreviewFrame | null;
  output: { width: number; height: number };
  layout: ZoomPreviewLayout;
  cornerRadius: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const context = canvas.current?.getContext('2d');
    if (!context) return;
    paintZoomPreview(context, {
      accent: '#ffffff',
      camera: { scale: 1, centerX: 0.5, centerY: 0.5 },
      cornerRadius: props.cornerRadius,
      frame: props.frame,
      height: props.output.height,
      width: props.output.width,
      layout: props.layout,
      view: 'result',
    });
  }, [props.frame, props.output, props.layout, props.cornerRadius]);
  return (
    <canvas
      ref={canvas}
      width={props.output.width}
      height={props.output.height}
      className="block w-full"
    />
  );
}
