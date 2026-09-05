import { useRef, type PointerEvent } from 'react';
import { Film, MessageSquare, GripVertical } from 'lucide-react';
import { translate } from '../../platform/i18n';
import type { ReviewAnchor, ReviewAnnotation } from '../../features/video/review/types';
import { reviewTimeLabel } from './controls';

type SelectionProps = {
  duration: number;
  time: number;
  selection: ReviewAnchor;
  annotations: readonly ReviewAnnotation[];
  onSeek(time: number): void;
  onSelect(value: ReviewAnchor): void;
  onComment(annotation: ReviewAnnotation): void;
};
const percent = (time: number, duration: number) => `${(time / duration) * 100}%`;

/** Original media, comment markers and transient selection share the same source-time plane. */
export function ReviewSourceLane(props: SelectionProps) {
  const lane = useRef<HTMLDivElement>(null);
  const selection = props.selection;
  const pointerTime = (event: PointerEvent) => {
    const bounds = lane.current!.getBoundingClientRect();
    return Math.max(
      0,
      Math.min(props.duration, ((event.clientX - bounds.left) / bounds.width) * props.duration)
    );
  };
  const drag = useRef<number | null>(null);
  return (
    <div
      ref={lane}
      className="relative mt-2 h-11 rounded-[var(--sniptale-radius-sm)] border
          border-[var(--sniptale-color-border-soft)]
          bg-[var(--sniptale-color-surface-panel)] focus-within:ring-1
          focus-within:ring-[var(--sniptale-color-accent)]"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 flex items-center gap-2 overflow-hidden px-3
          text-[11px] text-[var(--sniptale-color-text-muted)]"
      >
        {!props.annotations.length ? <Film size={14} className="shrink-0" /> : null}
        {!props.annotations.length ? (
          <span className="truncate">{translate('gallery.videoReview.sourceVideo')}</span>
        ) : null}
      </div>
      <input
        type="range"
        min={0}
        max={props.duration}
        step={0.001}
        value={props.time}
        aria-label={translate('gallery.videoReview.position')}
        aria-valuetext={reviewTimeLabel(props.time)}
        className="absolute inset-0 m-0 h-full w-full cursor-crosshair appearance-none opacity-0
          [&::-webkit-slider-thumb]:h-0 [&::-webkit-slider-thumb]:w-0
          [&::-webkit-slider-thumb]:appearance-none"
        onChange={(event) => {
          if (drag.current === null) props.onSeek(event.currentTarget.valueAsNumber);
        }}
        onPointerDown={(event) => {
          if (props.selection.kind === 'range') {
            drag.current = pointerTime(event);
            event.currentTarget.setPointerCapture(event.pointerId);
          }
        }}
        onPointerMove={(event) => {
          if (drag.current === null) return;
          const end = pointerTime(event);
          if (Math.abs(end - drag.current) > 0.001)
            props.onSelect({
              kind: 'range',
              start: Math.min(end, drag.current),
              end: Math.max(end, drag.current),
            });
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      />
      {selection.kind === 'range' ? (
        <div
          className="pointer-events-none absolute inset-y-0 border-x-2
          border-[var(--sniptale-color-accent)]
          bg-[color:color-mix(in_srgb,var(--sniptale-color-accent)_14%,transparent)]"
          style={{
            left: percent(selection.start, props.duration),
            width: percent(selection.end - selection.start, props.duration),
          }}
        >
          {(['start', 'end'] as const).map((edge) => (
            <SelectionHandle
              key={edge}
              edge={edge}
              selection={selection}
              onTime={pointerTime}
              onSelect={props.onSelect}
            />
          ))}
        </div>
      ) : null}
      <ReviewCommentMarkers
        annotations={props.annotations}
        duration={props.duration}
        onComment={props.onComment}
      />
    </div>
  );
}

function SelectionHandle(props: {
  edge: 'start' | 'end';
  selection: Extract<ReviewAnchor, { kind: 'range' }>;
  onTime(event: PointerEvent): number;
  onSelect(value: ReviewAnchor): void;
}) {
  const active = useRef(false);
  const move = (event: PointerEvent) => {
    const time = props.onTime(event);
    if (props.edge === 'start' ? time < props.selection.end : time > props.selection.start)
      props.onSelect({ ...props.selection, [props.edge]: time });
  };
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-auto absolute inset-y-1 z-10 flex w-2 cursor-ew-resize
        items-center justify-center rounded-sm bg-[var(--sniptale-color-accent)]
        ${props.edge === 'start' ? '-left-1' : '-right-1'}`}
      onPointerDown={(event) => {
        event.stopPropagation();
        active.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (active.current) move(event);
      }}
      onPointerUp={(event) => {
        if (active.current) move(event);
        active.current = false;
      }}
      onPointerCancel={() => {
        active.current = false;
      }}
    >
      <GripVertical size={11} className="text-[var(--sniptale-color-text-inverse)]" />
    </span>
  );
}

export function ReviewRangeFields(
  props: Pick<SelectionProps, 'duration' | 'onSelect'> & {
    selection: Extract<ReviewAnchor, { kind: 'range' }>;
  }
) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs">
      {(['start', 'end'] as const).map((key) => (
        <label
          key={key}
          className="flex items-center gap-2 text-[var(--sniptale-color-text-muted)]"
        >
          {translate(
            key === 'start' ? 'gallery.videoReview.rangeStart' : 'gallery.videoReview.rangeEnd'
          )}
          <input
            type="number"
            min={0}
            max={props.duration}
            step={0.001}
            value={props.selection[key]}
            className="w-20 rounded border border-[var(--sniptale-color-border-soft)] bg-transparent
          px-2 py-1 tabular-nums text-[var(--sniptale-color-text-primary)]"
            onChange={(event) => {
              const value = event.currentTarget.valueAsNumber;
              const next = { ...props.selection, [key]: value };
              if (
                Number.isFinite(value) &&
                next.start >= 0 &&
                next.end <= props.duration &&
                next.end > next.start
              )
                props.onSelect(next);
            }}
          />
        </label>
      ))}
    </div>
  );
}

/** Co-located point comments share one marker; the full set remains in the inspector feed. */
function ReviewCommentMarkers(
  props: Pick<SelectionProps, 'annotations' | 'duration' | 'onComment'>
) {
  const groups = new Map<string, ReviewAnnotation[]>();
  for (const annotation of props.annotations) {
    const anchor = annotation.anchor;
    const key =
      anchor.kind === 'point' ? `point:${anchor.time}` : `range:${anchor.start}:${anchor.end}`;
    const group = groups.get(key) ?? [];
    group.push(annotation);
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => {
    const annotation = group[0]!;
    const anchor = annotation.anchor;
    const time = anchor.kind === 'point' ? anchor.time : anchor.start;
    const range = anchor.kind === 'range';
    const caption = group.map((item) => item.text).join(' · ');
    return (
      <button
        key={annotation.id}
        type="button"
        title={caption}
        aria-label={[
          translate('gallery.videoReview.commentText'),
          reviewTimeLabel(time),
          caption,
        ].join(' · ')}
        onClick={() => props.onComment(annotation)}
        style={{
          left: range
            ? percent(time, props.duration)
            : `clamp(8px, ${percent(time, props.duration)}, calc(100% - 8px))`,
          ...(range
            ? {
                width: percent(anchor.end - anchor.start, props.duration),
                top: 6,
                height: 30,
                backgroundColor:
                  'color-mix(in srgb, var(--sniptale-color-accent) 14%, var(--sniptale-color-surface-canvas))',
              }
            : { top: -8 }),
        }}
        className={`absolute z-10 flex h-4 min-w-4 items-center justify-center gap-1
        overflow-hidden rounded border border-[var(--sniptale-color-border-accent-strong)]
        bg-[var(--sniptale-color-surface-canvas)] px-1 text-[10px] font-medium
        text-[var(--sniptale-color-accent-emphasis)] ${range ? '' : '-translate-x-1/2'}`}
      >
        <MessageSquare size={11} className="shrink-0" />
        {range ? (
          <span className="truncate">{translate('gallery.videoReview.commentText')}</span>
        ) : null}
        {group.length > 1 ? <span>{group.length}</span> : null}
      </button>
    );
  });
}
