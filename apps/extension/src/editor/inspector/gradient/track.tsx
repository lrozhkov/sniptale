import { useCallback, useEffect, useRef, useState, type PointerEvent, type RefObject } from 'react';
import type { EditorGradientColorStop } from '../../../features/editor/document/gradient';
import {
  createEditorGradientColorStopColor,
  resolveEditorGradientStopOpacity,
} from '../../../features/editor/document/gradient';
import { translate } from '../../../platform/i18n';
import { cx } from '../../chrome/ui';
import { createGradientEditorBackground } from './model';

export function GradientTrack(props: {
  onOffsetChange: (index: number, offset: number) => void;
  onSelect: (index: number) => void;
  selectedIndex: number;
  stops: readonly EditorGradientColorStop[];
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const { onOffsetChange, onSelect, selectedIndex, stops } = props;
  const resolveOffset = useCallback((clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) {
      return 0;
    }
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  }, []);
  const { moveStop, setDragIndex } = useGradientStopDrag({
    onOffsetChange,
    onSelect,
    resolveOffset,
  });
  const handleTrackPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    setDragIndex(selectedIndex);
    moveStop(selectedIndex, event.clientX);
  };
  const handleStopPointerDown = (index: number, event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragIndex(index);
    moveStop(index, event.clientX);
  };

  return (
    <div className="relative pb-5 pt-1">
      <GradientTrackRail
        trackRef={trackRef}
        selectedIndex={selectedIndex}
        stops={stops}
        onPointerDown={handleTrackPointerDown}
      />
      <GradientStopButtons
        selectedIndex={selectedIndex}
        stops={stops}
        onSelect={onSelect}
        onStopPointerDown={handleStopPointerDown}
      />
    </div>
  );
}

const GradientTrackRail = ({
  trackRef,
  selectedIndex,
  stops,
  onPointerDown,
}: {
  trackRef: RefObject<HTMLDivElement | null>;
  selectedIndex: number;
  stops: readonly EditorGradientColorStop[];
  onPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
}) => (
  <div
    ref={trackRef}
    role="slider"
    tabIndex={0}
    aria-label={translate('editor.gradient.position')}
    aria-valuemin={0}
    aria-valuemax={100}
    aria-valuenow={Math.round((stops[selectedIndex]?.offset ?? 0) * 100)}
    onPointerDown={onPointerDown}
    className="h-6 rounded-[6px] border border-[color:var(--sniptale-color-border-soft)]"
    style={{ backgroundImage: createGradientEditorBackground(stops) }}
  />
);

function useGradientStopDrag(args: {
  onOffsetChange: (index: number, offset: number) => void;
  onSelect: (index: number) => void;
  resolveOffset: (clientX: number) => number;
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const moveStop = useCallback(
    (index: number, clientX: number) => {
      args.onSelect(index);
      args.onOffsetChange(index, args.resolveOffset(clientX));
    },
    [args]
  );

  useEffect(() => {
    if (dragIndex === null) {
      return undefined;
    }

    const handlePointerMove = (event: globalThis.PointerEvent) => {
      moveStop(dragIndex, event.clientX);
    };
    const handlePointerUp = () => setDragIndex(null);

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [dragIndex, moveStop]);
  return { moveStop, setDragIndex };
}

function GradientStopButtons(props: {
  selectedIndex: number;
  stops: readonly EditorGradientColorStop[];
  onSelect: (index: number) => void;
  onStopPointerDown: (index: number, event: PointerEvent<HTMLButtonElement>) => void;
}) {
  return (
    <>
      {props.stops.map((stop, index) => (
        <button
          key={`${stop.color}-${index}-${stop.offset}`}
          type="button"
          aria-label={`${translate('editor.gradient.stop')} ${index + 1}`}
          onClick={() => props.onSelect(index)}
          onPointerDown={(event) => props.onStopPointerDown(index, event)}
          className={cx(
            'absolute top-8 h-4 w-4 -translate-x-1/2 rounded-full border-2',
            'bg-[color:var(--sniptale-color-surface-panel)]',
            index === props.selectedIndex
              ? 'border-[color:var(--sniptale-color-accent)]'
              : 'border-[color:var(--sniptale-color-border-strong)]'
          )}
          style={{ left: `${Math.round(stop.offset * 100)}%` }}
        >
          <span
            className="block h-full w-full rounded-full"
            style={{ background: createEditorGradientColorStopColor(stop) }}
          />
        </button>
      ))}
    </>
  );
}

export function resolveUpdatedGradientStopIndex(
  stops: readonly EditorGradientColorStop[],
  updatedStop: EditorGradientColorStop
): number {
  const offset = Math.min(1, Math.max(0, updatedStop.offset));
  const index = stops.findIndex(
    (stop) =>
      stop.color === updatedStop.color &&
      Math.abs(stop.offset - offset) < 0.0001 &&
      resolveEditorGradientStopOpacity(stop) === resolveEditorGradientStopOpacity(updatedStop)
  );

  if (index >= 0) {
    return index;
  }
  return stops.reduce(
    (nearestIndex, stop, currentIndex) =>
      Math.abs(stop.offset - offset) < Math.abs((stops[nearestIndex]?.offset ?? 0) - offset)
        ? currentIndex
        : nearestIndex,
    0
  );
}
