import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

const HANDLE_HEIGHT = 8;
const SCRIPT_MINIMUM = 180;
const CAMERA_MINIMUM = 56;
const RESIZE_HANDLE_CLASS = [
  'group flex h-2 shrink-0 cursor-row-resize touch-none items-center justify-center',
  'focus-visible:outline focus-visible:outline-1',
  'focus-visible:outline-[var(--sniptale-color-focus-ring)]',
].join(' ');
const RESIZE_GRIP_CLASS = [
  'h-px w-10 bg-[var(--sniptale-color-border-soft)]',
  'group-hover:bg-[var(--sniptale-color-text-secondary)]',
  'group-focus-visible:bg-[var(--sniptale-color-text-secondary)]',
].join(' ');

type CameraResizeGesture = { cancel(): void; dispose(): void };

/** Owns capture, acceptance and rollback for one camera resize gesture. */
function startCameraResizeGesture({
  handle,
  pointerId,
  origin,
  start,
  accepted,
  readLatest,
  updateDraft,
  accept,
  gestureRef,
}: {
  handle: HTMLElement;
  pointerId: number;
  origin: number;
  start: number;
  accepted: number | null;
  readLatest(): { clamp(value: number): number };
  updateDraft(value: number | null): void;
  accept(value: number | null): void;
  gestureRef: { current: CameraResizeGesture | null };
}): CameraResizeGesture | null {
  const owner = handle.ownerDocument.defaultView;
  if (!owner) return null;
  let value = start;
  let active = true;
  const dispose = () => {
    if (!active) return;
    active = false;
    owner.removeEventListener('pointermove', move);
    owner.removeEventListener('pointerup', finish);
    owner.removeEventListener('pointercancel', abort);
    owner.removeEventListener('keydown', key);
    owner.removeEventListener('blur', cancel);
    owner.removeEventListener('pagehide', cancel);
    handle.removeEventListener('lostpointercapture', cancel);
    gestureRef.current = null;
    if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
  };
  const cancel = () => {
    dispose();
    accept(accepted);
    updateDraft(null);
  };
  const move = (next: PointerEvent) => {
    if (next.pointerId !== pointerId) return;
    if (handle.ownerDocument.defaultView !== owner) {
      cancel();
      return;
    }
    value = readLatest().clamp(start + next.clientY - origin);
    updateDraft(value);
  };
  const finish = (next: PointerEvent) => {
    if (next.pointerId !== pointerId) return;
    dispose();
    accept(value);
    updateDraft(null);
  };
  const abort = (next: PointerEvent) => {
    if (next.pointerId === pointerId) cancel();
  };
  const key = (next: KeyboardEvent) => {
    if (next.key !== 'Escape') return;
    next.preventDefault();
    cancel();
  };
  handle.setPointerCapture(pointerId);
  owner.addEventListener('pointermove', move);
  owner.addEventListener('pointerup', finish);
  owner.addEventListener('pointercancel', abort);
  owner.addEventListener('keydown', key);
  owner.addEventListener('blur', cancel);
  owner.addEventListener('pagehide', cancel);
  handle.addEventListener('lostpointercapture', cancel);
  return { cancel, dispose };
}

/** Tracks the available layout budget across ordinary and floating document changes. */
function observeCameraLayout(
  node: HTMLElement,
  divider: HTMLElement | null,
  gesture: { current: CameraResizeGesture | null },
  onBudget: (height: number) => void
): () => void {
  const parent = node.parentElement!;
  let owner: Window | null = null;
  const measure = () => {
    const nextOwner = node.ownerDocument.defaultView;
    if (owner !== nextOwner) {
      owner?.removeEventListener('resize', measure);
      gesture.current?.cancel();
      owner = nextOwner;
      owner?.addEventListener('resize', measure);
    }
    if (!owner) return;
    const style = owner.getComputedStyle(parent);
    const fixed = Array.from(parent.children).reduce((total, sibling) => {
      if (sibling === node || sibling === divider) return total;
      const siblingStyle = owner!.getComputedStyle(sibling);
      if (
        Number(siblingStyle.flexGrow) > 0 ||
        siblingStyle.position === 'absolute' ||
        siblingStyle.display === 'none'
      )
        return total;
      return (
        total +
        sibling.getBoundingClientRect().height +
        (parseFloat(siblingStyle.marginTop) || 0) +
        (parseFloat(siblingStyle.marginBottom) || 0)
      );
    }, 0);
    const gaps = (parseFloat(style.rowGap) || 0) * Math.max(0, parent.children.length - 1);
    onBudget(
      Math.max(
        0,
        parent.clientHeight -
          (parseFloat(style.paddingTop) || 0) -
          (parseFloat(style.paddingBottom) || 0) -
          fixed -
          gaps -
          HANDLE_HEIGHT
      )
    );
  };
  measure();
  const surface = node.closest('[data-recording-surface]');
  surface?.addEventListener('sniptale-recording-surface-change', measure);
  const observer = new ResizeObserver(measure);
  observer.observe(parent);
  for (const sibling of Array.from(parent.children)) {
    if (
      sibling !== node &&
      sibling !== divider &&
      Number(node.ownerDocument.defaultView?.getComputedStyle(sibling).flexGrow) === 0
    )
      observer.observe(sibling);
  }
  return () => {
    observer.disconnect();
    surface?.removeEventListener('sniptale-recording-surface-change', measure);
    owner?.removeEventListener('resize', measure);
    gesture.current?.dispose();
    gesture.current = null;
  };
}

/** Keeps a disposable camera size while adapting it to the companion's actual height. */
export function CameraPreviewLayout(props: {
  enabled: boolean;
  children: ReactNode;
  label: string;
  resetLabel?: string;
}) {
  const preview = useRef<HTMLDivElement>(null);
  const divider = useRef<HTMLDivElement>(null);
  const gesture = useRef<CameraResizeGesture | null>(null);
  const [budget, setBudget] = useState(0);
  const [requested, setRequested] = useState<number | null>(null);
  const [draft, setDraft] = useState<number | null>(null);
  const maximum = Math.max(Math.min(CAMERA_MINIMUM, budget), budget - SCRIPT_MINIMUM);
  const minimum = Math.min(CAMERA_MINIMUM, maximum);
  const clamp = (value: number) => Math.round(Math.max(minimum, Math.min(maximum, value)));
  const automatic = Math.max(80, Math.min(160, budget * 0.2));
  const height = clamp(draft ?? requested ?? automatic);
  const latest = useRef({ clamp, height, requested });
  latest.current = { clamp, height, requested };

  useLayoutEffect(() => {
    setDraft(null);
    const node = preview.current;
    const parent = node?.parentElement;
    if (!props.enabled || !node || !parent) return;
    return observeCameraLayout(node, divider.current, gesture, setBudget);
  }, [props.enabled]);

  return (
    <>
      <div
        ref={preview}
        data-ui="camera-recorder.preview-layout"
        className={props.enabled ? 'flex min-h-0 shrink-0' : 'flex min-h-0 flex-1'}
        style={props.enabled ? { height } : undefined}
      >
        {props.children}
      </div>
      {props.enabled ? (
        <div
          ref={divider}
          role="separator"
          tabIndex={0}
          aria-label={props.label}
          aria-orientation="horizontal"
          aria-valuemin={minimum}
          aria-valuemax={Math.round(maximum)}
          aria-valuenow={height}
          aria-valuetext={`${height}px`}
          title={props.resetLabel ?? props.label}
          data-ui="camera-recorder.preview-resize"
          className={RESIZE_HANDLE_CLASS}
          onDoubleClick={() => {
            gesture.current?.cancel();
            setRequested(null);
            setDraft(null);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              gesture.current?.cancel();
              setRequested(null);
              setDraft(null);
              return;
            }
            let next: number;
            if (event.key === 'Home') next = minimum;
            else if (event.key === 'End') next = maximum;
            else if (event.key === 'ArrowUp' || event.key === 'ArrowDown')
              next = height + (event.key === 'ArrowDown' ? 1 : -1) * (event.shiftKey ? 32 : 8);
            else return;
            event.preventDefault();
            gesture.current?.cancel();
            setRequested(clamp(next));
          }}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            const handle = event.currentTarget;
            const owner = handle.ownerDocument.defaultView;
            if (!owner) return;
            event.preventDefault();
            handle.focus({ preventScroll: true });
            gesture.current?.cancel();
            gesture.current = startCameraResizeGesture({
              handle,
              pointerId: event.pointerId,
              origin: event.clientY,
              start: latest.current.height,
              accepted: latest.current.requested,
              readLatest: () => latest.current,
              updateDraft: setDraft,
              accept: setRequested,
              gestureRef: gesture,
            });
          }}
        >
          <span aria-hidden="true" className={RESIZE_GRIP_CLASS} />
        </div>
      ) : null}
    </>
  );
}
