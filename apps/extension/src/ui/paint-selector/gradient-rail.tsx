import { useEffect, useRef, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';
import {
  addGradientStop,
  removeGradientStop,
  serializePaintToCss,
  updateGradientStop,
  type Gradient,
  type PaintStopIdFactory,
} from '@sniptale/foundation/paint';
import { translate } from '../../platform/i18n';

const RAIL_CLASS_NAME = 'relative h-3 cursor-crosshair overflow-visible rounded-[3px]';
const MIDPOINT_CLASS_NAME = [
  'absolute -top-[13px] z-[1] grid h-5 min-h-0! w-6 -translate-x-1/2 cursor-ew-resize',
  'touch-none place-items-center border-0! bg-transparent! p-0! outline-none',
  'focus-visible:outline-1 focus-visible:outline-current',
].join(' ');
const STOP_CLASS_NAME = [
  'absolute top-1/2 z-[2] grid h-7 min-h-0! w-6 -translate-x-1/2 -translate-y-1/2',
  'cursor-ew-resize touch-none place-items-center rounded-full border-0! bg-transparent! p-0!',
  'outline-none focus-visible:outline-1 focus-visible:outline-current',
].join(' ');
const DIAMOND_CLASS_NAME = [
  'pointer-events-none block h-1.5 w-1.5 rotate-45',
  'border border-[var(--sniptale-color-text-secondary)] bg-[var(--sniptale-color-surface-panel)]',
].join(' ');
const CHECKER = 'conic-gradient(#c4c4c4 25%, transparent 0 50%, #c4c4c4 0 75%, transparent 0)';
type Stop = Gradient['stops'][number];
interface RailProps {
  compact?: boolean;
  createId: PaintStopIdFactory;
  gradient: Gradient;
  selectedStopId: string | null;
  onChange: (gradient: Gradient) => void;
  onSelect: (id: string) => void;
}
interface RailDrag {
  kind: 'stop' | 'midpoint';
  stop: Stop;
  next?: Stop;
  startX: number;
  target: HTMLButtonElement;
  pointerId: number;
}
function removeStop(props: RailProps, id: string) {
  if (props.gradient.stops.length <= 2) return;
  const index = props.gradient.stops.findIndex((stop) => stop.id === id);
  const next = removeGradientStop(props.gradient, id);
  props.onChange(next);
  if (props.selectedStopId === id) {
    const selected = next.stops[Math.max(0, index - 1)];
    if (selected) props.onSelect(selected.id);
  }
}
function positionFromEvent(event: PointerEvent, rail: HTMLDivElement) {
  const rect = rail.getBoundingClientRect();
  return Math.min(1, Math.max(0, (event.clientX - rect.left) / Math.max(1, rect.width)));
}
function updateRailDrag(
  props: RailProps,
  active: RailDrag,
  event: PointerEvent,
  rail: HTMLDivElement
) {
  const absolute = positionFromEvent(event, rail);
  if (active.kind === 'stop') {
    if (Math.abs(event.clientX - active.startX) < 3) return;
    props.onChange(updateGradientStop(props.gradient, active.stop.id, { position: absolute }));
  } else if (active.next) {
    const midpoint =
      (absolute - active.stop.position) /
      Math.max(0.0001, active.next.position - active.stop.position);
    props.onChange(updateGradientStop(props.gradient, active.stop.id, { midpoint }));
  }
}
function handleRailKey(
  event: KeyboardEvent<HTMLButtonElement>,
  stop: Stop,
  props: RailProps,
  midpoint = false
) {
  if (!midpoint && (event.key === 'Delete' || event.key === 'Backspace')) {
    event.preventDefault();
    removeStop(props, stop.id);
    return;
  }
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  event.preventDefault();
  const delta = (event.shiftKey ? 0.1 : 0.01) * (event.key === 'ArrowLeft' ? -1 : 1);
  const patch = midpoint
    ? { midpoint: stop.midpoint + delta }
    : { position: stop.position + delta };
  props.onChange(updateGradientStop(props.gradient, stop.id, patch));
}

/** One capture owner cancels stop and midpoint gestures through the same lifecycle. */
function useRailDrag(props: RailProps, rail: RefObject<HTMLDivElement | null>) {
  const current = useRef(props);
  current.current = props;
  const active = useRef<RailDrag | null>(null);
  const cancel = () => {
    const previous = active.current;
    active.current = null;
    if (previous?.target.hasPointerCapture(previous.pointerId))
      previous.target.releasePointerCapture(previous.pointerId);
  };
  useEffect(() => {
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || !active.current) return;
      event.preventDefault();
      event.stopPropagation();
      cancel();
    };
    window.addEventListener('blur', cancel);
    document.addEventListener('keydown', escape, true);
    return () => {
      cancel();
      window.removeEventListener('blur', cancel);
      document.removeEventListener('keydown', escape, true);
    };
  }, []);
  const begin = (event: PointerEvent<HTMLButtonElement>, stop: Stop, next?: Stop) => {
    event.stopPropagation();
    if (event.button !== 0) return;
    cancel();
    if (!next && current.current.selectedStopId !== stop.id) current.current.onSelect(stop.id);
    event.currentTarget.setPointerCapture(event.pointerId);
    const gesture: RailDrag = {
      kind: next ? 'midpoint' : 'stop',
      stop,
      startX: event.clientX,
      target: event.currentTarget,
      pointerId: event.pointerId,
      ...(next ? { next } : {}),
    };
    active.current = gesture;
    if (next && rail.current) updateRailDrag(current.current, gesture, event, rail.current);
  };
  const move = (event: PointerEvent<HTMLButtonElement>) => {
    const gesture = active.current;
    if (
      !gesture ||
      !rail.current ||
      gesture.pointerId !== event.pointerId ||
      !event.currentTarget.hasPointerCapture(event.pointerId)
    )
      return;
    updateRailDrag(current.current, gesture, event, rail.current);
  };
  const end = (event: PointerEvent<HTMLButtonElement>) => {
    const gesture = active.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const rect = rail.current?.getBoundingClientRect();
    if (
      gesture.kind === 'stop' &&
      event.type === 'pointerup' &&
      rect &&
      (event.clientY < rect.top - 28 || event.clientY > rect.bottom + 52)
    )
      removeStop(current.current, gesture.stop.id);
    cancel();
  };
  return { begin, move, end, cancel };
}

function MidpointMarker({
  stop,
  next,
  drag,
  props,
}: {
  stop: Stop;
  next: Stop;
  drag: ReturnType<typeof useRailDrag>;
  props: RailProps;
}) {
  if (next.position === stop.position) return null;
  const position = stop.position + (next.position - stop.position) * stop.midpoint;
  const label = translate('highlighter.paintPicker.midpointAfter');
  return (
    <button
      type="button"
      aria-label={`${label} ${Math.round(stop.position * 100)}%`}
      className={MIDPOINT_CLASS_NAME}
      style={{ left: `${position * 100}%` }}
      onPointerDown={(event) => drag.begin(event, stop, next)}
      onPointerMove={drag.move}
      onPointerUp={drag.end}
      onPointerCancel={drag.end}
      onLostPointerCapture={drag.cancel}
      onKeyDown={(event) => handleRailKey(event, stop, props, true)}
    >
      <span aria-hidden="true" className={DIAMOND_CLASS_NAME} />
    </button>
  );
}
function StopMarker({
  stop,
  drag,
  props,
}: {
  stop: Stop;
  drag: ReturnType<typeof useRailDrag>;
  props: RailProps;
}) {
  const selected = props.selectedStopId === stop.id;
  const label = translate('highlighter.paintPicker.gradientStop');
  return (
    <button
      type="button"
      aria-label={`${label} ${Math.round(stop.position * 100)}%`}
      aria-pressed={selected}
      className={STOP_CLASS_NAME}
      style={{ left: `${stop.position * 100}%`, zIndex: selected ? 3 : 2 }}
      onClick={() => props.onSelect(stop.id)}
      onPointerDown={(event) => drag.begin(event, stop)}
      onPointerMove={drag.move}
      onPointerUp={drag.end}
      onPointerCancel={drag.end}
      onLostPointerCapture={drag.cancel}
      onKeyDown={(event) => handleRailKey(event, stop, props)}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none block h-4 w-4 rounded-full border-2 border-white bg-transparent"
        style={{
          boxShadow: selected
            ? '0 0 0 1px #000b, 0 0 0 3px var(--sniptale-color-text-primary)'
            : '0 0 0 1px #0008',
        }}
      />
    </button>
  );
}

export function GradientRail(props: RailProps) {
  const railRef = useRef<HTMLDivElement>(null);
  const drag = useRailDrag(props, railRef);
  const railGradient: Gradient = {
    ...props.gradient,
    type: 'linear',
    angle: 90,
    repeat: { enabled: false, span: 1 },
  };
  const background = serializePaintToCss({ kind: 'gradient', gradient: railGradient });
  const add = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || event.target !== event.currentTarget || !railRef.current) return;
    const next = addGradientStop(
      props.gradient,
      positionFromEvent(event, railRef.current),
      props.createId
    );
    const added = next.stops.find(
      (stop) => !props.gradient.stops.some((current) => current.id === stop.id)
    );
    props.onChange(next);
    if (added) props.onSelect(added.id);
  };
  return (
    <div
      className="min-w-0"
      data-ui="shared.ui.paint-selector.rail"
      style={{ padding: props.compact ? '16px 12px 18px' : '18px 12px 20px' }}
    >
      <div
        ref={railRef}
        className={RAIL_CLASS_NAME}
        title={translate('highlighter.paintPicker.addStopHint')}
        style={{
          backgroundImage: `${background}, ${CHECKER}`,
          backgroundSize: 'auto, 12px 12px',
          backgroundColor: '#eee',
        }}
        onPointerDown={add}
      >
        {props.gradient.stops.slice(0, -1).map((stop, index) => (
          <MidpointMarker
            key={`midpoint-${stop.id}`}
            stop={stop}
            next={props.gradient.stops[index + 1]!}
            drag={drag}
            props={props}
          />
        ))}
        {props.gradient.stops.map((stop) => (
          <StopMarker key={stop.id} stop={stop} drag={drag} props={props} />
        ))}
      </div>
    </div>
  );
}
