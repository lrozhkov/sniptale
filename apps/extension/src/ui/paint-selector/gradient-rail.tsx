import { useRef, type KeyboardEvent, type PointerEvent } from 'react';
import {
  addGradientStop,
  removeGradientStop,
  serializePaintToCss,
  updateGradientStop,
  type Gradient,
  type PaintStopIdFactory,
} from '@sniptale/foundation/paint';
import { translate } from '../../platform/i18n';

const RAIL_CLASS_NAME = [
  'relative h-14 cursor-crosshair overflow-visible rounded-[12px] border-2',
  'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_72%,transparent)]',
  'shadow-[inset_0_1px_2px_color-mix(in_srgb,var(--sniptale-color-shadow-strong)_10%,transparent)]',
].join(' ');
const MIDPOINT_CLASS_NAME =
  'absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-white bg-black/60 shadow';

export function GradientRail(props: {
  createId: PaintStopIdFactory;
  gradient: Gradient;
  selectedStopId: string | null;
  onChange: (gradient: Gradient) => void;
  onSelect: (id: string) => void;
}) {
  const railRef = useRef<HTMLDivElement | null>(null);
  const draggedStopRef = useRef<string | null>(null);
  const positionFromEvent = (event: PointerEvent) => {
    const rect = railRef.current!.getBoundingClientRect();
    return Math.min(1, Math.max(0, (event.clientX - rect.left) / Math.max(1, rect.width)));
  };
  const updateFromPointer = (event: PointerEvent<HTMLButtonElement>, id: string) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    props.onChange(updateGradientStop(props.gradient, id, { position: positionFromEvent(event) }));
  };
  const finishStopDrag = (event: PointerEvent<HTMLButtonElement>, id: string) => {
    if (draggedStopRef.current !== id) return;
    draggedStopRef.current = null;
    const rect = railRef.current?.getBoundingClientRect();
    if (rect && (event.clientY < rect.top - 28 || event.clientY > rect.bottom + 52)) {
      props.onChange(removeGradientStop(props.gradient, id));
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };
  const updateMidpointFromPointer = (
    event: PointerEvent<HTMLButtonElement>,
    stop: Gradient['stops'][number],
    next: Gradient['stops'][number]
  ) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const absolute = positionFromEvent(event);
    const midpoint = (absolute - stop.position) / Math.max(0.0001, next.position - stop.position);
    props.onChange(updateGradientStop(props.gradient, stop.id, { midpoint }));
  };
  const handleKey = (event: KeyboardEvent<HTMLButtonElement>, id: string) => {
    const stop = props.gradient.stops.find((candidate) => candidate.id === id);
    if (!stop) return;
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      props.onChange(removeGradientStop(props.gradient, id));
      return;
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      const delta = (event.shiftKey ? 0.1 : 0.01) * (event.key === 'ArrowLeft' ? -1 : 1);
      props.onChange(updateGradientStop(props.gradient, id, { position: stop.position + delta }));
    }
  };
  return (
    <div className="space-y-2" data-ui="shared.ui.paint-selector.rail">
      <div
        ref={railRef}
        className={RAIL_CLASS_NAME}
        style={{
          backgroundImage: serializePaintToCss({ kind: 'gradient', gradient: props.gradient }),
        }}
        onPointerDown={(event) => {
          if (event.target !== event.currentTarget) return;
          const next = addGradientStop(props.gradient, positionFromEvent(event), props.createId);
          const added = next.stops.find(
            (stop) => !props.gradient.stops.some((current) => current.id === stop.id)
          );
          props.onChange(next);
          if (added) props.onSelect(added.id);
        }}
      >
        {props.gradient.stops.slice(0, -1).map((stop, index) => {
          const next = props.gradient.stops[index + 1]!;
          const position = stop.position + (next.position - stop.position) * stop.midpoint;
          return (
            <button
              key={`midpoint-${stop.id}`}
              type="button"
              aria-label={`${translate('highlighter.paintPicker.midpointAfter')} ${Math.round(stop.position * 100)}%`}
              className={MIDPOINT_CLASS_NAME}
              style={{ left: `${position * 100}%` }}
              onPointerDown={(event) => {
                event.stopPropagation();
                updateMidpointFromPointer(event, stop, next);
              }}
              onPointerMove={(event) => {
                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                  updateMidpointFromPointer(event, stop, next);
                }
              }}
            />
          );
        })}
        {props.gradient.stops.map((stop) => (
          <button
            key={stop.id}
            type="button"
            aria-label={`${translate('highlighter.paintPicker.gradientStop')} ${Math.round(stop.position * 100)}%`}
            aria-pressed={props.selectedStopId === stop.id}
            className={[
              'absolute top-full mt-1.5 h-5 w-4 -translate-x-1/2 rounded-b-[5px] border-2',
              'bg-white shadow-sm transition-transform hover:scale-110',
              props.selectedStopId === stop.id
                ? 'border-[var(--sniptale-color-accent)]'
                : 'border-[var(--sniptale-color-border-strong)]',
            ].join(' ')}
            style={{ left: `${stop.position * 100}%`, backgroundColor: stop.color }}
            onClick={() => props.onSelect(stop.id)}
            onPointerDown={(event) => {
              event.stopPropagation();
              draggedStopRef.current = stop.id;
              props.onSelect(stop.id);
              updateFromPointer(event, stop.id);
            }}
            onPointerMove={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId))
                updateFromPointer(event, stop.id);
            }}
            onPointerUp={(event) => finishStopDrag(event, stop.id)}
            onPointerCancel={(event) => finishStopDrag(event, stop.id)}
            onKeyDown={(event) => handleKey(event, stop.id)}
          />
        ))}
      </div>
      <div className="h-5" />
    </div>
  );
}
