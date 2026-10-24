import {
  type QuickEditSpotlight,
  clampQuickEditSpotlightArea,
  areQuickEditSpotlightAreasEqual,
} from '../../features/video/project/scene/focus-appearance';
import { captureReviewSpatialPointer } from './spatial-pointer';
import type { QuickEditHomography } from '../../features/video/composition/motion/spatial-geometry';
import { useRef, type PointerEvent, type KeyboardEvent } from 'react';
import { useCapturedPreview } from './captured-preview';
import { translate } from '../../platform/i18n';

import {
  ReviewFocusFrame,
  focusCorner,
  useFocusFrameHover,
  type FocusCorner,
} from './focus-area-frame';
import type { QuickEditRect } from '../../features/video/review/advanced/scene';

type FocusAreaProps = {
  projection?: QuickEditHomography | undefined;
  area: QuickEditSpotlight['area'];
  label?: string;
  output: { width: number; height: number };
  /** Transformed decorated window, including the optional header. */
  video: QuickEditRect;
  disabled?: boolean;
  /** Optional pixel aspect; omitted for freely sized Focus areas. */
  aspectRatio?: number | undefined;
  /** Inspector framing stays visible; the stage retains interaction-only controls. */
  alwaysVisible?: boolean;
  /** Apply the editor's authored geometry limits before displaying or committing a gesture. */
  constrainArea?: ((area: QuickEditSpotlight['area']) => QuickEditSpotlight['area']) | undefined;
  onInteract?(): void;
  onPreview?: ((value: QuickEditSpotlight['area'] | null) => void) | undefined;
  onChange(value: QuickEditSpotlight['area']): void;
};
/** Shared window area view; stage and inspector use one Spotlight gesture owner. */
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
        visible={props.alwaysVisible || gesture.visible}
        pointerInteraction={gesture.pointerInteraction}
        role="group"
        tabIndex={props.disabled ? -1 : 0}
        aria-label={props.label ?? translate('gallery.videoReview.focusSpotlight')}
        title={translate('gallery.videoReview.focusAreaHint')}
        {...gesture.frameHandlers}
      />
    </div>
  );
}

type SpotlightCapture = {
  pointer: ReturnType<typeof captureReviewSpatialPointer>;
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

/** Captured window geometry, preview and commit/cancel stay in this single transient owner. */
function useSpotlightAreaGesture(props: FocusAreaProps) {
  const { onPreview } = props;
  const { frame, hovered, trackPointer, pointerInteraction, keyboardInteraction } =
    useFocusFrameHover();
  const host = useRef<HTMLDivElement>(null);
  const previewFrame = useRef<number | null>(null);
  const { drag, draft, setDraft, cancel } = useCapturedPreview<
    SpotlightCapture,
    QuickEditSpotlight['area']
  >(props.disabled, () => {
    if (previewFrame.current !== null) cancelAnimationFrame(previewFrame.current);
    previewFrame.current = null;
    onPreview?.(null);
  });
  const areaValue = draft ?? props.area;
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    trackPointer(event);
    const active = drag.current;
    if (!active || active.id !== event.pointerId) return;
    const dx = (active.pointer(event).x - active.x) / active.width;
    const dy = (active.pointer(event).y - active.y) / active.height;
    const ratio = props.aspectRatio
      ? (props.aspectRatio * props.video.height) / props.video.width
      : undefined;
    const candidate = active.resize
      ? resizeSpotlightArea(
          active.area,
          active.resize,
          dx,
          dy,
          ratio,
          props.constrainArea && ratio ? 0.01 * Math.min(1, ratio) : undefined
        )
      : { ...active.area, x: active.area.x + dx, y: active.area.y + dy };
    const area = props.constrainArea?.(candidate) ?? clampQuickEditSpotlightArea(candidate);
    drag.current!.pending = area;
    if (previewFrame.current !== null) return;
    previewFrame.current = requestAnimationFrame(() => {
      previewFrame.current = null;
      if (drag.current !== active || !active.pending) return;
      setDraft(active.pending);
      onPreview?.(active.pending);
    });
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    trackPointer(event);
    if (drag.current?.id !== event.pointerId) return;
    if (drag.current.pending) {
      onPointerMove(event);
      if (!areQuickEditSpotlightAreasEqual(drag.current.pending, drag.current.area))
        props.onChange(drag.current.pending);
    }
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
    const pointer = captureReviewSpatialPointer(host.current, props.projection, props.output);
    const point = pointer(event);
    drag.current = {
      pointer,
      id: event.pointerId,
      x: point.x,
      y: point.y,
      area: props.area,
      pending: null,
      resize: focusCorner(event.target),
      node: host.current,
      width: props.projection
        ? props.video.width
        : (bounds.width * props.video.width) / props.output.width,
      height: props.projection
        ? props.video.height
        : (bounds.height * props.video.height) / props.output.height,
    };
    setDraft(props.area);
    host.current.setPointerCapture(event.pointerId);
    onPreview?.(props.area);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && drag.current) {
      event.preventDefault();
      event.stopPropagation();
      cancel();
      return;
    }
    const area = moveSpotlightWithKey(areaValue, event.key, event.shiftKey);
    if (props.disabled || !area) return;
    event.preventDefault();
    event.stopPropagation();
    if (drag.current) return;
    keyboardInteraction();
    props.onInteract?.();
    const next = props.constrainArea?.(area) ?? clampQuickEditSpotlightArea(area);
    if (!areQuickEditSpotlightAreasEqual(next, areaValue)) props.onChange(next);
  };
  return {
    host,
    frame,
    area: areaValue,
    visible: hovered && !draft,
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
  dy: number,
  ratio?: number,
  minimumWidth?: number
) {
  const west = corner.endsWith('w'),
    north = corner.startsWith('n');
  const right = area.x + area.width,
    bottom = area.y + area.height;
  if (ratio) {
    const horizontal = area.width + (west ? -dx : dx);
    const vertical = (area.height + (north ? -dy : dy)) * ratio;
    const preferred = Math.abs(dx) >= Math.abs(dy * ratio) ? horizontal : vertical;
    const maximum = Math.min(west ? right : 1 - area.x, (north ? bottom : 1 - area.y) * ratio);
    const width = Math.min(
      maximum,
      Math.max(minimumWidth ?? Math.max(0.01, 0.01 * ratio), preferred)
    );
    const height = width / ratio;
    return { x: west ? right - width : area.x, y: north ? bottom - height : area.y, width, height };
  }
  const x = west ? Math.max(0, Math.min(right - 0.01, area.x + dx)) : area.x;
  const y = north ? Math.max(0, Math.min(bottom - 0.01, area.y + dy)) : area.y;
  return {
    x,
    y,
    width: west ? right - x : Math.max(0.01, Math.min(1, right + dx) - x),
    height: north ? bottom - y : Math.max(0.01, Math.min(1, bottom + dy) - y),
  };
}

/** Keyboard window movement uses the same area bounds as pointer movement. */
function moveSpotlightWithKey(area: QuickEditSpotlight['area'], key: string, shift: boolean) {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(key)) return null;
  const step = shift ? 0.1 : 0.01;
  return {
    ...area,
    x: area.x + (key === 'ArrowLeft' ? -step : key === 'ArrowRight' ? step : 0),
    y: area.y + (key === 'ArrowUp' ? -step : key === 'ArrowDown' ? step : 0),
  };
}
