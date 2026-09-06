import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { translate } from '../../../platform/i18n';
import type { VideoEditorMaterialSourceRange } from '../../contracts/insertion';

interface SourceTimelineProps {
  duration: number;
  fps: number;
  cursor: number;
  range: VideoEditorMaterialSourceRange;
  disabled: boolean;
  onSeek: (time: number) => void;
  onRange: (range: VideoEditorMaterialSourceRange) => void;
}
type Gesture = {
  pointerId: number;
  origin: number;
  x: number;
  cursor: number;
  range: VideoEditorMaterialSourceRange;
  mode: 'seek' | 'select' | 'start' | 'end';
  preview: VideoEditorMaterialSourceRange | null;
};

/** One captured source gesture; range changes commit on release and cancel without touching montage. */
function useSourceRangeGesture(props: SourceTimelineProps) {
  const plane = useRef<HTMLDivElement>(null);
  const drag = useRef<Gesture | null>(null);
  const [preview, setPreview] = useState<VideoEditorMaterialSourceRange | null>(null);
  const timeAt = (x: number) => {
    const bounds = plane.current!.getBoundingClientRect();
    return Math.max(
      0,
      Math.min(
        props.duration,
        Math.round(((x - bounds.left) / Math.max(1, bounds.width)) * props.duration * props.fps) /
          props.fps
      )
    );
  };
  const finish = (cancel: boolean) => {
    const current = drag.current;
    if (!current) return;
    drag.current = null;
    setPreview(null);
    if (plane.current?.hasPointerCapture(current.pointerId))
      plane.current.releasePointerCapture(current.pointerId);
    if (cancel) props.onSeek(current.cursor);
    else if (current.preview) props.onRange(current.preview);
  };
  useEffect(() => {
    const cancel = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !drag.current) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      finish(true);
    };
    window.addEventListener('keydown', cancel, true);
    return () => window.removeEventListener('keydown', cancel, true);
  });
  useEffect(() => {
    if (props.disabled) finish(true);
  });
  const down = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current || props.disabled || props.duration <= 0 || event.button !== 0) return;
    event.preventDefault();
    const target =
      event.target instanceof Element
        ? event.target.closest('[data-source-edge]')?.getAttribute('data-source-edge')
        : null;
    const mode =
      target === 'start' || target === 'end'
        ? target
        : event.target instanceof Element && event.target.closest('[data-source-ruler]')
          ? 'seek'
          : 'select';
    const origin = timeAt(event.clientX);
    drag.current = {
      pointerId: event.pointerId,
      origin,
      x: event.clientX,
      cursor: props.cursor,
      range: props.range,
      mode,
      preview: null,
    };
    plane.current!.setPointerCapture(event.pointerId);
    if (event.target instanceof HTMLElement)
      event.target.closest<HTMLElement>('[role="slider"]')?.focus();
    if (mode === 'seek' || mode === 'select') props.onSeek(origin);
  };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || event.pointerId !== current.pointerId) return;
    const time = timeAt(event.clientX);
    if (current.mode === 'seek') {
      props.onSeek(time);
      return;
    }
    if (Math.abs(event.clientX - current.x) < 4 && !current.preview) return;
    const range =
      current.mode === 'select'
        ? { start: Math.min(current.origin, time), end: Math.max(current.origin, time) }
        : { ...current.range, [current.mode]: time };
    current.preview = constrainSourceRange(
      range,
      props.duration,
      props.fps,
      current.mode === 'end' ? 'end' : 'start'
    );
    setPreview(current.preview);
  };
  return { plane, preview, down, move, finish };
}

function constrainSourceRange(
  range: VideoEditorMaterialSourceRange,
  duration: number,
  fps: number,
  edge: 'start' | 'end'
) {
  const frame = Math.min(duration, 1 / fps);
  const start = Math.max(0, Math.round(range.start * fps) / fps);
  const end = range.end >= duration ? duration : Math.max(frame, Math.round(range.end * fps) / fps);
  if (edge === 'start') {
    const lastStart = Math.floor((end - frame + 1e-9) * fps) / fps;
    return { start: Math.max(0, Math.min(start, lastStart)), end };
  }
  const firstEnd = Math.ceil((start + frame - 1e-9) * fps) / fps;
  return { start, end: Math.min(duration, Math.max(end, firstEnd)) };
}

/** Ruler seeks, the source lane selects, and handles trim the selected source interval. */
export function SourceRangeTimeline(props: SourceTimelineProps) {
  const gesture = useSourceRangeGesture(props);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    const node = gesture.plane.current;
    if (!node) return;
    const measure = () => setWidth(Math.max(1, node.clientWidth));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [gesture.plane]);
  const range = gesture.preview ?? props.range;
  const percent = (time: number) => `${props.duration > 0 ? (time / props.duration) * 100 : 0}%`;
  const markers = sourceRulerMarkers(props.duration, width);
  return (
    <div
      ref={gesture.plane}
      data-ui="video-editor.source-range"
      data-in={range.start}
      data-out={range.end}
      className="relative min-w-0 select-none touch-none px-0 pb-1"
      onPointerDown={gesture.down}
      onPointerMove={gesture.move}
      onPointerUp={() => gesture.finish(false)}
      onPointerCancel={() => gesture.finish(true)}
      onLostPointerCapture={() => gesture.finish(true)}
    >
      <div
        data-source-ruler="true"
        role="slider"
        tabIndex={props.disabled ? -1 : 0}
        aria-label={translate('videoEditor.app.sourcePosition')}
        aria-disabled={props.disabled}
        aria-valuemin={0}
        aria-valuemax={props.duration}
        aria-valuenow={props.cursor}
        className={[
          'relative h-7 cursor-ew-resize overflow-hidden focus-visible:outline',
          'focus-visible:outline-1',
          'focus-visible:outline-[var(--sniptale-color-focus-ring)]',
        ].join(' ')}
        onKeyDown={(event) => {
          if (props.disabled) return;
          const time =
            event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? props.duration
                : event.key === 'ArrowLeft'
                  ? props.cursor - 1 / props.fps
                  : event.key === 'ArrowRight'
                    ? props.cursor + 1 / props.fps
                    : null;
          if (time === null) return;
          event.preventDefault();
          event.stopPropagation();
          props.onSeek(time);
        }}
      >
        {markers
          .filter((marker) => marker.second <= props.duration)
          .map((marker) => (
            <span
              key={marker.id}
              aria-hidden="true"
              className={[
                'pointer-events-none absolute bottom-0 h-2 border-l',
                'border-[var(--sniptale-color-border-soft)]',
              ].join(' ')}
              style={{ left: percent(marker.second) }}
            >
              <span className="absolute -top-4 left-1 text-[10px] text-[var(--sniptale-color-text-muted)]">
                {marker.label}
              </span>
            </span>
          ))}
      </div>
      <div
        className="relative h-10 cursor-crosshair rounded bg-[var(--sniptale-color-surface-hover)]"
        data-ui="video-editor.source-lane"
      >
        <div
          className="absolute inset-y-0 bg-[var(--sniptale-color-accent-soft)]"
          style={{ left: percent(range.start), width: percent(range.end - range.start) }}
        />
        {(['start', 'end'] as const).map((edge) => (
          <SourceRangeEdge
            key={edge}
            edge={edge}
            range={range}
            props={props}
            position={percent(range[edge])}
          />
        ))}
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 w-px bg-[var(--sniptale-color-accent)]"
        style={{ left: percent(props.cursor) }}
      >
        <span className="absolute -left-1 top-0 h-2 w-2 rounded-b-sm bg-[var(--sniptale-color-accent)]" />
      </div>
    </div>
  );
}

function SourceRangeEdge({
  edge,
  range,
  props,
  position,
}: {
  edge: 'start' | 'end';
  range: VideoEditorMaterialSourceRange;
  props: SourceTimelineProps;
  position: string;
}) {
  return (
    <button
      type="button"
      role="slider"
      data-source-edge={edge}
      disabled={props.disabled}
      aria-label={translate(
        edge === 'start' ? 'videoEditor.app.sourceMarkIn' : 'videoEditor.app.sourceMarkOut'
      )}
      aria-valuemin={edge === 'start' ? 0 : range.start + 1 / props.fps}
      aria-valuemax={edge === 'start' ? range.end - 1 / props.fps : props.duration}
      aria-valuenow={range[edge]}
      className={[
        'absolute inset-y-0 z-10 w-3 cursor-ew-resize border-0 bg-transparent p-0',
        'focus-visible:outline focus-visible:outline-1',
        'focus-visible:outline-[var(--sniptale-color-focus-ring)]',
      ].join(' ')}
      style={{ left: position, transform: edge === 'start' ? 'none' : 'translateX(-100%)' }}
      onKeyDown={(event) => {
        if (props.disabled) return;
        const value =
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? props.duration
              : event.key === 'ArrowLeft'
                ? (Math.ceil(range[edge] * props.fps - 1e-9) - 1) / props.fps
                : event.key === 'ArrowRight'
                  ? (Math.floor(range[edge] * props.fps + 1e-9) + 1) / props.fps
                  : null;
        if (value === null) return;
        event.preventDefault();
        event.stopPropagation();
        props.onRange(
          constrainSourceRange({ ...range, [edge]: value }, props.duration, props.fps, edge)
        );
      }}
    >
      <span
        className={[
          'absolute inset-y-0 w-0.5 bg-[var(--sniptale-color-accent)]',
          edge === 'start' ? 'left-0' : 'right-0',
        ].join(' ')}
      />
    </button>
  );
}

function sourceRulerMarkers(duration: number, width: number) {
  if (duration <= 0) return [];
  const desired = duration / Math.max(1, width / 88);
  const unit = 10 ** Math.floor(Math.log10(desired));
  const step = ([1, 2, 5, 10].find((factor) => factor * unit >= desired) ?? 10) * unit;
  return Array.from({ length: Math.floor(duration / step) + 1 }, (_, index) => {
    const second = index * step;
    const whole = Math.floor(second);
    const fraction =
      step < 1
        ? second.toFixed(Math.max(1, -Math.floor(Math.log10(step)))).split('.')[1]
        : undefined;
    const label = `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}${fraction ? `.${fraction}` : ''}`;
    return { id: index, second, label };
  });
}
