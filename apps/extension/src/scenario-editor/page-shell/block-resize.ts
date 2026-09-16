import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react';
import { GUIDE_LIMITS } from '@sniptale/runtime-contracts/scenario/types/guide';
import { snapGuideSize } from './resize-snapping';

type Axis = 'width' | 'height';
type Size = { width: number; height: number };
type Gesture = {
  axis: Axis;
  origin: number;
  initial: number;
  value: number;
  basis: number;
  dragging: boolean;
  target: HTMLElement;
  pointerId: number;
  neighbors: Array<{ element: HTMLElement; value: number }>;
};

/** Owns one temporary size draft, capture, snap guides and a single accepted edit. */
export function useGuideBlockResize({
  id,
  width,
  height,
  disabled,
  snap,
  onCommit,
}: Size & {
  id: string;
  disabled: boolean;
  snap: boolean;
  onCommit: (axis: Axis, value: number) => void;
}) {
  const element = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const latest = useRef(onCommit);
  latest.current = onCommit;
  const [preview, setPreview] = useState<{ axis: Axis; value: number } | null>(null);
  const swallowClick = useRef(false);
  const clearGuides = () => {
    element.current?.removeAttribute('data-size-snap');
    for (const neighbor of gesture.current?.neighbors ?? [])
      neighbor.element.removeAttribute('data-size-match');
  };
  useLayoutEffect(() => {
    if (
      preview?.axis === 'height' &&
      element.current &&
      Math.abs(element.current.getBoundingClientRect().height - preview.value) > 1
    )
      clearGuides();
  }, [preview]);
  const release = () => {
    clearGuides();
    const current = gesture.current;
    gesture.current = null;
    document.documentElement.removeAttribute('data-guide-width-resizing');
    document.documentElement.removeAttribute('data-guide-height-resizing');
    if (current?.target.hasPointerCapture(current.pointerId))
      current.target.releasePointerCapture(current.pointerId);
  };
  const cancel = () => {
    if (gesture.current) swallowClick.current = true;
    release();
    setPreview(null);
  };
  useEffect(() => {
    cancel();
    return release;
  }, [id, width, height, disabled, snap]);
  const begin = (event: PointerEvent<HTMLElement>, axis: Axis) => {
    if (disabled || event.button !== 0 || gesture.current) return;
    const block = element.current;
    const parent = block?.parentElement;
    if (!block || !parent) return;
    const basis =
      parent.getBoundingClientRect().width + (parseFloat(getComputedStyle(parent).columnGap) || 0);
    if (basis <= 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.focus({ preventScroll: true });
    swallowClick.current = false;
    const initial = axis === 'width' ? width : block.getBoundingClientRect().height;
    gesture.current = {
      axis,
      origin: axis === 'width' ? event.clientX : event.clientY,
      initial,
      value: initial,
      basis,
      dragging: false,
      target: event.currentTarget,
      pointerId: event.pointerId,
      neighbors: Array.from(
        (block.closest('.guide-step-blocks') ?? parent).querySelectorAll<HTMLElement>(
          '.guide-block'
        )
      )
        .filter((neighbor) => neighbor !== block)
        .map((neighbor) => ({
          element: neighbor,
          value:
            axis === 'width'
              ? Number(neighbor.dataset['width'])
              : neighbor.getBoundingClientRect().height,
        }))
        .filter((neighbor) => Number.isFinite(neighbor.value) && neighbor.value > 0),
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const move = (event: PointerEvent<HTMLElement>) => {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const delta = (current.axis === 'width' ? event.clientX : event.clientY) - current.origin;
    if (!current.dragging && Math.abs(delta) < 5) return;
    current.dragging = true;
    swallowClick.current = true;
    const horizontal = current.axis === 'width';
    const raw = current.initial + delta * (horizontal ? 100 / current.basis : 1);
    const targets = current.neighbors.map((neighbor) => neighbor.value);
    if (horizontal) targets.push(20, 25, 33, 50, 66, 75, 100);
    const result =
      snap && !event.altKey
        ? snapGuideSize(raw, targets, horizontal ? 600 / current.basis : 6)
        : { value: raw, matched: false };
    current.value = Math.round(
      Math.max(
        horizontal ? GUIDE_LIMITS.minBlockWidthPercent : 0,
        Math.min(horizontal ? 100 : GUIDE_LIMITS.maxDimension, result.value)
      )
    );
    clearGuides();
    if (result.matched) {
      element.current?.setAttribute('data-size-snap', current.axis);
      for (const neighbor of current.neighbors)
        if (Math.abs(neighbor.value - result.value) < 0.5)
          neighbor.element.setAttribute('data-size-match', current.axis);
    }
    document.documentElement.setAttribute(`data-guide-${current.axis}-resizing`, '');
    setPreview({ axis: current.axis, value: current.value });
  };
  const finish = (event: PointerEvent<HTMLElement>) => {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    release();
    setPreview(null);
    if (
      current.dragging &&
      current.value !== current.initial &&
      current.value !== (current.axis === 'width' ? width : height)
    )
      latest.current(current.axis, current.value);
  };
  return { element, preview, begin, move, finish, cancel, swallowClick };
}
