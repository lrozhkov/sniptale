import { useRef, type PointerEvent, type KeyboardEvent } from 'react';
import { useCapturedPreview } from './captured-preview';
import { translate } from '../../platform/i18n';
import { clampQuickEditSpotlightArea } from '../../features/video/review/advanced/focus';
import type { QuickEditSpotlight } from '../../features/video/review/advanced/types';
import {
  ReviewFocusFrame,
  focusCorner,
  useFocusFrameHover,
  type FocusCorner,
} from './focus-area-frame';
import type { QuickEditRect } from '../../features/video/review/advanced/scene';

type FocusAreaProps = {
  spotlight: QuickEditSpotlight;
  output: { width: number; height: number };
  video: QuickEditRect;
  disabled?: boolean;
  onInteract?(): void;
  onPreview?: ((value: QuickEditSpotlight | null) => void) | undefined;
  onChange(value: QuickEditSpotlight): void;
};
/** Shared source area view; stage and inspector use one Spotlight gesture owner. */
export function ReviewFocusArea(props: FocusAreaProps) {
  const gesture = useSpotlightAreaGesture(props);
  return (
    <div
      ref={gesture.host}
      className="pointer-events-none absolute inset-0 z-10"
      data-ui="gallery.videoReview.focusArea"
      style={{ touchAction: 'none' }}
      {...gesture.planeHandlers}
    >
      <ReviewFocusFrame
        frameRef={gesture.frame}
        area={areaRect(gesture.area, props.video)}
        output={props.output}
        borderWidth={1}
        visible={gesture.visible}
        pointerInteraction={gesture.pointerInteraction}
        role="group"
        tabIndex={props.disabled ? -1 : 0}
        aria-label={translate('gallery.videoReview.focusSpotlight')}
        title={translate('gallery.videoReview.focusAreaHint')}
        {...gesture.frameHandlers}
      />
    </div>
  );
}

type SpotlightCapture = {
  id: number;
  x: number;
  y: number;
  resize: FocusCorner | null;
  node: HTMLElement;
  width: number;
  height: number;
  area: QuickEditSpotlight['area'];
  pending: QuickEditSpotlight['area'] | null;
};

/** Captured source geometry, preview and commit/cancel stay in this single transient owner. */
function useSpotlightAreaGesture(props: FocusAreaProps) {
  const { onPreview } = props;
  const { frame, hovered, trackPointer, pointerInteraction, keyboardInteraction } =
    useFocusFrameHover();
  const host = useRef<HTMLDivElement>(null);
  const { drag, draft, setDraft, cancel } = useCapturedPreview<
    SpotlightCapture,
    QuickEditSpotlight['area']
  >(props.disabled, () => onPreview?.(null));
  const value = { ...props.spotlight, area: draft ?? props.spotlight.area };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    trackPointer(event);
    const active = drag.current;
    if (!active || active.id !== event.pointerId) return;
    const dx = (event.clientX - active.x) / active.width;
    const dy = (event.clientY - active.y) / active.height;
    const area = clampQuickEditSpotlightArea(
      active.resize
        ? resizeSpotlightArea(active.area, active.resize, dx, dy)
        : { ...active.area, x: active.area.x + dx, y: active.area.y + dy }
    );
    drag.current!.pending = area;
    setDraft(area);
    onPreview?.({ ...props.spotlight, area });
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    trackPointer(event);
    if (drag.current?.id !== event.pointerId) return;
    if (drag.current.pending) props.onChange({ ...props.spotlight, area: drag.current.pending });
    cancel();
  };
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (props.disabled || drag.current || event.button !== 0) return;
    const bounds = host.current?.getBoundingClientRect();
    if (!host.current || !bounds || !(bounds.width > 0 && bounds.height > 0)) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.focus();
    trackPointer(event);
    props.onInteract?.();
    drag.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      area: props.spotlight.area,
      pending: null,
      resize: focusCorner(event.target),
      node: host.current,
      width: (bounds.width * props.video.width) / props.output.width,
      height: (bounds.height * props.video.height) / props.output.height,
    };
    setDraft(props.spotlight.area);
    host.current.setPointerCapture(event.pointerId);
    onPreview?.(props.spotlight);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      cancel();
      return;
    }
    const area = moveSpotlightWithKey(value.area, event.key, event.shiftKey);
    if (props.disabled || !area) return;
    event.preventDefault();
    event.stopPropagation();
    if (drag.current) return;
    keyboardInteraction();
    props.onInteract?.();
    props.onChange({ ...props.spotlight, area });
  };
  return {
    host,
    frame,
    area: value.area,
    visible: hovered || !!draft,
    pointerInteraction,
    planeHandlers: {
      onPointerMove,
      onPointerUp,
      onPointerCancel: cancel,
      onLostPointerCapture: cancel,
    },
    frameHandlers: {
      onPointerDown,
      onKeyDown,
      onBlur: cancel,
      onFocus: keyboardInteraction,
      onPointerEnter: trackPointer,
      onPointerLeave: trackPointer,
    },
  };
}

function areaRect(area: QuickEditSpotlight['area'], video: QuickEditRect) {
  return {
    x: video.x + area.x * video.width,
    y: video.y + area.y * video.height,
    width: area.width * video.width,
    height: area.height * video.height,
  };
}

/** Opposite edges stay fixed; clamp the moving edge before deriving size. */
function resizeSpotlightArea(
  area: QuickEditSpotlight['area'],
  corner: FocusCorner,
  dx: number,
  dy: number
) {
  const west = corner.endsWith('w'),
    north = corner.startsWith('n');
  const right = area.x + area.width,
    bottom = area.y + area.height;
  const x = west ? Math.max(0, Math.min(right - 0.01, area.x + dx)) : area.x;
  const y = north ? Math.max(0, Math.min(bottom - 0.01, area.y + dy)) : area.y;
  return {
    x,
    y,
    width: west ? right - x : Math.max(0.01, Math.min(1, right + dx) - x),
    height: north ? bottom - y : Math.max(0.01, Math.min(1, bottom + dy) - y),
  };
}

/** Keyboard source movement uses the same area bounds as pointer movement. */
function moveSpotlightWithKey(area: QuickEditSpotlight['area'], key: string, shift: boolean) {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(key)) return null;
  const step = shift ? 0.1 : 0.01;
  return clampQuickEditSpotlightArea({
    ...area,
    x: area.x + (key === 'ArrowLeft' ? -step : key === 'ArrowRight' ? step : 0),
    y: area.y + (key === 'ArrowUp' ? -step : key === 'ArrowDown' ? step : 0),
  });
}
