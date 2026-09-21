import { useCallback, useEffect, useRef, useState } from 'react';
import { translate } from '../../platform/i18n';
import { clampQuickEditSpotlightArea } from '../../features/video/review/advanced/focus';
import type { QuickEditSpotlight } from '../../features/video/review/advanced/types';
import type { QuickEditRect } from '../../features/video/review/advanced/scene';

/** Shared area manipulation for the stage and the inspector; one commit per captured gesture. */
export function ReviewFocusArea(props: {
  spotlight: QuickEditSpotlight;
  output: { width: number; height: number };
  video: QuickEditRect;
  disabled?: boolean;
  onInteract?(): void;
  onPreview?: ((value: QuickEditSpotlight | null) => void) | undefined;
  onChange(value: QuickEditSpotlight): void;
}) {
  const { onPreview } = props;
  const host = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    id: number;
    x: number;
    y: number;
    resize: boolean;
    area: QuickEditSpotlight['area'];
    pending: QuickEditSpotlight['area'] | null;
  } | null>(null);
  const [draft, setDraft] = useState<QuickEditSpotlight['area'] | null>(null);
  const value = { ...props.spotlight, area: draft ?? props.spotlight.area };
  const opening = areaRect(value.area, props.video);
  const preview = useRef(onPreview);
  useEffect(() => {
    preview.current = onPreview;
  });
  useEffect(
    () => () => {
      if (drag.current) preview.current?.(null);
    },
    []
  );
  const cancel = useCallback(() => {
    if (drag.current) onPreview?.(null);
    drag.current = null;
    setDraft(null);
  }, [onPreview]);
  useEffect(() => {
    if (props.disabled) cancel();
  }, [props.disabled, cancel]);
  return (
    <div
      ref={host}
      className="pointer-events-none absolute inset-0 z-10"
      data-ui="gallery.videoReview.focusArea"
      style={{ touchAction: 'none' }}
      onPointerMove={(event) => {
        const active = drag.current;
        const bounds = host.current?.getBoundingClientRect();
        if (!active || active.id !== event.pointerId || !bounds) return;
        const dx =
          ((event.clientX - active.x) * props.output.width) / bounds.width / props.video.width;
        const dy =
          ((event.clientY - active.y) * props.output.height) / bounds.height / props.video.height;
        const area = clampQuickEditSpotlightArea(
          active.resize
            ? {
                ...active.area,
                width: Math.min(1 - active.area.x, active.area.width + dx),
                height: Math.min(1 - active.area.y, active.area.height + dy),
              }
            : { ...active.area, x: active.area.x + dx, y: active.area.y + dy }
        );
        drag.current!.pending = area;
        setDraft(area);
        onPreview?.({ ...props.spotlight, area });
      }}
      onPointerUp={(event) => {
        if (drag.current?.id !== event.pointerId) return;
        if (drag.current.pending)
          props.onChange({ ...props.spotlight, area: drag.current.pending });
        cancel();
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={cancel}
      onLostPointerCapture={cancel}
    >
      <div
        role="group"
        tabIndex={props.disabled ? -1 : 0}
        aria-label={translate('gallery.videoReview.focusSpotlight')}
        title={translate('gallery.videoReview.focusAreaHint')}
        className="pointer-events-auto absolute cursor-move border border-[var(--sniptale-color-accent)] outline-none
        focus-visible:ring-1 focus-visible:ring-[var(--sniptale-color-accent)]"
        style={{
          left: `${(opening.x / props.output.width) * 100}%`,
          top: `${(opening.y / props.output.height) * 100}%`,
          width: `${(opening.width / props.output.width) * 100}%`,
          height: `${(opening.height / props.output.height) * 100}%`,
        }}
        onPointerDown={(event) => {
          if (props.disabled || drag.current || event.button !== 0) return;
          event.preventDefault();
          event.stopPropagation();
          event.currentTarget.focus();
          props.onInteract?.();
          drag.current = {
            id: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            area: props.spotlight.area,
            pending: null,
            resize: event.target instanceof Element && !!event.target.closest('[data-resize]'),
          };
          host.current?.setPointerCapture(event.pointerId);
          onPreview?.(props.spotlight);
        }}
        onBlur={cancel}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
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
          if (drag.current) return;
          props.onInteract?.();
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
    </div>
  );
}

function areaRect(area: QuickEditSpotlight['area'], video: QuickEditRect) {
  return {
    x: video.x + area.x * video.width,
    y: video.y + area.y * video.height,
    width: area.width * video.width,
    height: area.height * video.height,
  };
}
