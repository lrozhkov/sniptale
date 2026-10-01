import {
  useLayoutEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type PointerEvent,
  type Ref,
} from 'react';
import type { QuickEditRect } from '../../features/video/review/advanced/scene';
import './focus-area-frame.css';

export type FocusCorner = 'nw' | 'ne' | 'sw' | 'se';
const corners: readonly FocusCorner[] = ['nw', 'ne', 'sw', 'se'];

/** Only the four declared grips can initiate a resize. */
export function focusCorner(target: EventTarget | null): FocusCorner | null {
  const value =
    target instanceof Element ? target.closest('[data-resize]')?.getAttribute('data-resize') : null;
  return corners.find((corner) => corner === value) ?? null;
}

/** Presentation only: the caller owns source geometry, gesture capture and mutations. */
export function ReviewFocusFrame(
  props: HTMLAttributes<HTMLDivElement> & {
    area: QuickEditRect;
    output: { width: number; height: number };
    frameRef?: Ref<HTMLDivElement>;
    visible: boolean;
    pointerInteraction: boolean;
    borderWidth: 1 | 2;
    center?: { x: number; y: number };
  }
) {
  const {
    area,
    output,
    frameRef,
    visible,
    pointerInteraction,
    borderWidth,
    center,
    ...attributes
  } = props;
  return (
    <div
      {...attributes}
      ref={frameRef}
      data-focus-frame
      data-controls-visible={visible}
      data-pointer-interaction={pointerInteraction}
      className="review-focus-frame"
      style={{
        left: `${(area.x / output.width) * 100}%`,
        top: `${(area.y / output.height) * 100}%`,
        width: `${(area.width / output.width) * 100}%`,
        height: `${(area.height / output.height) * 100}%`,
        borderWidth,
      }}
    >
      {corners.map((corner) => (
        <span key={corner} data-resize={corner} className="review-focus-grip" />
      ))}
      {center ? (
        <span
          className="review-focus-center"
          style={{
            left: `${((center.x - area.x) / area.width) * 100}%`,
            top: `${((center.y - area.y) / area.height) * 100}%`,
          }}
        />
      ) : null}
    </div>
  );
}

/** Reconcile hover against the new rectangle after a captured gesture commits or rolls back. */
export function useFocusFrameHover() {
  const frame = useRef<HTMLDivElement>(null);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const [pointerInteraction, setPointerInteraction] = useState(false);
  const [hovered, setHovered] = useState(false);
  const reconcile = () => {
    const point = lastPoint.current;
    const bounds = frame.current?.getBoundingClientRect();
    setHovered(
      !!point &&
        !!bounds &&
        point.x >= bounds.left &&
        point.x <= bounds.right &&
        point.y >= bounds.top &&
        point.y <= bounds.bottom
    );
  };
  useLayoutEffect(reconcile);
  const trackPointer = (event: PointerEvent<HTMLElement>) => {
    setPointerInteraction(true);
    lastPoint.current = { x: event.clientX, y: event.clientY };
    reconcile();
  };
  return {
    frame,
    hovered,
    trackPointer,
    pointerInteraction,
    keyboardInteraction: () => setPointerInteraction(false),
  };
}
