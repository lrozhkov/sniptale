import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type KeyboardEvent,
} from 'react';
import type { QuickEditCameraTransform } from '../../features/video/review/advanced/types';
import type { QuickEditRect } from '../../features/video/review/advanced/scene';

type Center = { centerX: number; centerY: number };
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

type CameraGestureProps = {
  camera: QuickEditCameraTransform;
  videoRect: QuickEditRect;
  output: { width: number; height: number };
  view: 'area' | 'result';
  disabled?: boolean | undefined;
  onPreview?: ((center: Center | null) => void) | undefined;
  onCommit(center: Center): void;
  onInteract?(): void;
};

/** A captured coordinate system prevents camera feedback while the image moves under the pointer. */
export function useReviewCameraGesture(props: CameraGestureProps) {
  const { onPreview } = props;
  const [draft, setDraft] = useState<Center | null>(null);
  const drag = useRef<{
    id: number;
    x: number;
    y: number;
    width: number;
    height: number;
    origin: Center;
    pending: Center | null;
    direction: number;
  } | null>(null);
  const baseline = useRef<Center | null>(null);
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
  const publish = (center: Center) => {
    const bounded = { centerX: clamp01(center.centerX), centerY: clamp01(center.centerY) };
    if (drag.current) drag.current.pending = bounded;
    setDraft(bounded);
    onPreview?.(bounded);
  };
  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (props.disabled || event.button !== 0 || drag.current) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (!(bounds.width > 0 && bounds.height > 0)) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.focus();
    props.onInteract?.();
    const initial = captureCameraPointer(props, event, bounds);
    drag.current = initial;
    baseline.current = null;
    event.currentTarget.setPointerCapture(event.pointerId);
    onPreview?.(initial.origin);
    if (initial.pending) publish(initial.pending);
  };
  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    const active = drag.current;
    if (!active || active.id !== event.pointerId) return;
    publish({
      centerX:
        active.origin.centerX + (active.direction * (event.clientX - active.x)) / active.width,
      centerY:
        active.origin.centerY + (active.direction * (event.clientY - active.y)) / active.height,
    });
  };
  const onPointerUp = (event: PointerEvent<HTMLElement>) => {
    const active = drag.current;
    if (!active || active.id !== event.pointerId) return;
    if (active.pending) props.onCommit(active.pending);
    cancel();
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (props.disabled) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (!drag.current && baseline.current) props.onCommit(baseline.current);
      baseline.current = null;
      cancel();
      return;
    }
    const step = event.shiftKey ? 0.1 : 0.01;
    const delta = cameraKeyDelta(event.key, step);
    if (!delta) return;
    event.preventDefault();
    event.stopPropagation();
    if (drag.current) return;
    props.onInteract?.();
    props.onCommit({
      centerX: clamp01(props.camera.centerX + delta.x),
      centerY: clamp01(props.camera.centerY + delta.y),
    });
  };
  return {
    camera: { ...props.camera, ...draft },
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onKeyDown,
      onPointerCancel: cancel,
      onLostPointerCapture: cancel,
      onFocus: () => {
        baseline.current = { centerX: props.camera.centerX, centerY: props.camera.centerY };
      },
      onBlur: () => {
        baseline.current = null;
        cancel();
      },
    },
  };
}

function cameraKeyDelta(key: string, step: number) {
  if (key === 'ArrowLeft') return { x: -step, y: 0 };
  if (key === 'ArrowRight') return { x: step, y: 0 };
  if (key === 'ArrowUp') return { x: 0, y: -step };
  if (key === 'ArrowDown') return { x: 0, y: step };
  return null;
}

function cameraPointerPoint(
  event: PointerEvent<HTMLElement>,
  bounds: DOMRect,
  output: { width: number; height: number },
  video: QuickEditRect
): Center {
  return {
    centerX:
      (((event.clientX - bounds.left) * output.width) / bounds.width - video.x) / video.width,
    centerY:
      (((event.clientY - bounds.top) * output.height) / bounds.height - video.y) / video.height,
  };
}

/** Capture the visible crop origin and pointer scale once, including click-to-place in Area mode. */
function captureCameraPointer(
  props: CameraGestureProps,
  event: PointerEvent<HTMLElement>,
  bounds: DOMRect
) {
  const result = props.view === 'result';
  const factor = result ? props.camera.scale : 1;
  const limit = 0.5 / props.camera.scale;
  const visible = {
    centerX: Math.max(limit, Math.min(1 - limit, props.camera.centerX)),
    centerY: Math.max(limit, Math.min(1 - limit, props.camera.centerY)),
  };
  const point = cameraPointerPoint(event, bounds, props.output, props.videoRect);
  const place =
    !result &&
    (Math.abs(point.centerX - visible.centerX) > limit ||
      Math.abs(point.centerY - visible.centerY) > limit);
  return {
    id: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    width: (props.videoRect.width * factor * bounds.width) / props.output.width,
    height: (props.videoRect.height * factor * bounds.height) / props.output.height,
    origin: place ? point : visible,
    pending: place ? point : null,
    direction: result ? -1 : 1,
  };
}
