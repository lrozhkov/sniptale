import { useRef, type PointerEvent, type KeyboardEvent, type RefObject } from 'react';
import type { QuickEditCameraTransform } from '../../features/video/review/advanced/types';
import type { QuickEditRect } from '../../features/video/review/advanced/scene';

import { useCapturedPreview } from './captured-preview';
import { captureCameraPointer, resizeCameraPointer } from './camera-pointer';

type Center = { centerX: number; centerY: number; scale?: number };
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

type CameraGestureProps = {
  camera: QuickEditCameraTransform;
  videoRect: QuickEditRect;
  /** Actual Area footprint in normalized source coordinates, when the scene supplies it. */
  visibleArea?: QuickEditRect;
  viewport?: QuickEditRect;
  interactionElement?: RefObject<HTMLElement | null>;
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
  const { drag, draft, setDraft, cancel } = useCapturedPreview<
    ReturnType<typeof captureCameraPointer> & { node: HTMLElement; pending: Center | null },
    Center
  >(props.disabled, () => onPreview?.(null));
  const baseline = useRef<Center | null>(null);
  const publish = (center: Center) => {
    const bounded = {
      ...(center.scale === undefined ? {} : { scale: center.scale }),
      centerX: clamp01(center.centerX),
      centerY: clamp01(center.centerY),
    };
    if (drag.current) drag.current.pending = bounded;
    setDraft(bounded);
    onPreview?.(bounded);
  };
  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (props.disabled || event.button !== 0 || drag.current) return;
    const node = props.interactionElement?.current ?? event.currentTarget;
    const bounds = node.getBoundingClientRect();
    if (!(bounds.width > 0 && bounds.height > 0)) return;
    event.preventDefault();
    event.stopPropagation();
    node.focus();
    props.onInteract?.();
    const initial = captureCameraPointer(props, event, bounds);
    drag.current = { ...initial, node };
    setDraft(initial.origin);
    baseline.current = null;
    node.setPointerCapture(event.pointerId);
    onPreview?.(initial.origin);
    if (initial.pending) publish(initial.pending);
  };
  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    const active = drag.current;
    if (!active || active.id !== event.pointerId) return;
    if (active.corner) {
      publish(
        resizeCameraPointer(
          active,
          (event.clientX - active.x) / active.width,
          (event.clientY - active.y) / active.height
        )
      );
      return;
    }
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
    captured: !!draft,
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
