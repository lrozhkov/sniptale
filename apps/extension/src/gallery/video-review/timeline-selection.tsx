import { useEffect, useRef, useState } from 'react';
import { Film, MessageSquare, Scissors, Gauge } from 'lucide-react';
import { translate } from '../../platform/i18n';
import type { ReviewAnchor, ReviewAnnotation, ReviewEdit } from '../../features/video/review/types';
import {
  SNAP_THRESHOLD_PX,
  getSnapCandidates,
  snapTimelineTime,
} from '../../features/video/review/snap';
import { reviewTimeLabel } from './controls';

type SelectionProps = {
  duration: number;
  time: number;
  selection: ReviewAnchor;
  annotations: readonly ReviewAnnotation[];
  edits?: readonly ReviewEdit[];
  boundaries?: readonly number[];
  onEdit?(edit: ReviewEdit): void;
  onChangeEdit?(edit: ReviewEdit, range: ReviewAnchor): void;
  onSeek(time: number): void;
  onSelect(value: ReviewAnchor): void;
  onComment(annotation: ReviewAnnotation): void;
};
const percent = (time: number, duration: number) => `${(time / duration) * 100}%`;

/** One source lane; existing edits can be moved or resized directly. */
export function ReviewSourceLane(props: SelectionProps) {
  const [guide, setGuide] = useState<number | null>(null);
  return (
    <div
      data-ui="gallery.videoReview.sourceLane"
      className="relative mt-1 h-12 rounded bg-[var(--sniptale-color-surface-hover)]"
    >
      {guide !== null ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 z-20 w-px
              bg-[var(--sniptale-color-accent-emphasis)]"
          style={{ left: percent(guide, props.duration) }}
        />
      ) : null}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 flex items-center gap-2 overflow-hidden px-3
            text-[11px] text-[var(--sniptale-color-text-muted)]"
      >
        <Film size={14} />
        <span>{translate('gallery.videoReview.sourceVideo')}</span>
      </div>
      {props.selection.kind === 'range' ? (
        <div
          className="pointer-events-none absolute inset-y-0 border-x-2
              border-[var(--sniptale-color-accent)]
              bg-[color:color-mix(in_srgb,var(--sniptale-color-accent)_14%,transparent)]"
          style={{
            left: percent(props.selection.start, props.duration),
            width: percent(props.selection.end - props.selection.start, props.duration),
          }}
        />
      ) : null}
      {props.edits?.map((edit) => (
        <ReviewEditBlock key={edit.id} {...props} onSnap={setGuide} edit={edit} />
      ))}
      <ReviewCommentMarkers {...props} />
    </div>
  );
}

function ReviewEditBlock(
  props: SelectionProps & { edit: ReviewEdit; onSnap(guide: number | null): void }
) {
  const { edit, duration, onSnap } = props;
  const [preview, setPreview] = useState<{ start: number; end: number } | null>(null);
  const drag = useRef<{
    x: number;
    width: number;
    edge: 'start' | 'end' | 'move';
    range: { start: number; end: number };
    moved: boolean;
    node: HTMLDivElement;
    pointerId: number;
  } | null>(null);
  useEffect(() => {
    const cancel = (event: KeyboardEvent) => {
      const current = drag.current;
      if (event.key !== 'Escape' || !current) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      drag.current = null;
      setPreview(null);
      onSnap(null);
      if (current.node.hasPointerCapture(current.pointerId))
        current.node.releasePointerCapture(current.pointerId);
    };
    window.addEventListener('keydown', cancel, true);
    return () => window.removeEventListener('keydown', cancel, true);
  }, [onSnap]);
  const range = preview ?? edit;
  const label =
    edit.kind === 'cut'
      ? translate('gallery.videoReview.cutLabel')
      : `${translate('gallery.videoReview.speedMode')} ${edit.rate < 0.25 ? `1/${1 / edit.rate}` : edit.rate}×`;
  const tone = edit.kind === 'cut' ? '--sniptale-color-danger' : '--sniptale-color-accent';
  return (
    <div
      className="absolute inset-y-1 z-[5] rounded text-xs text-[var(--sniptale-color-text-primary)]"
      style={{
        left: percent(range.start, duration),
        width: percent(range.end - range.start, duration),
        backgroundColor: `color-mix(in srgb, var(${tone}) 28%, var(--sniptale-color-surface-canvas))`,
      }}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.stopPropagation();
        const target = event.target;
        const edge =
          target instanceof Element
            ? target.closest('[data-edge]')?.getAttribute('data-edge')
            : null;
        drag.current = {
          x: event.clientX,
          width: event.currentTarget.parentElement!.getBoundingClientRect().width,
          edge: edge === 'start' || edge === 'end' ? edge : 'move',
          range: { start: edit.start, end: edit.end },
          moved: false,
          node: event.currentTarget,
          pointerId: event.pointerId,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
        props.onEdit?.(edit);
      }}
      onPointerMove={(event) => {
        const current = drag.current;
        if (!current || current.width <= 0) return;
        const delta = ((event.clientX - current.x) / current.width) * duration;
        current.moved ||= Math.abs(event.clientX - current.x) > 3;
        const length = edit.end - edit.start;
        let start =
          current.edge === 'end'
            ? edit.start
            : Math.max(
                0,
                Math.min(duration - (current.edge === 'move' ? length : 0), edit.start + delta)
              );
        let end =
          current.edge === 'start'
            ? edit.end
            : current.edge === 'move'
              ? start + length
              : Math.max(0, Math.min(duration, edit.end + delta));
        const snapped = snapReviewEditDrag({
          edge: current.edge,
          start,
          end,
          duration,
          widthPx: current.width,
          bypass: event.shiftKey,
          edits: props.edits,
          boundaries: props.boundaries,
          playhead: props.time,
        });
        onSnap(snapped.guide);
        if (snapped.start < snapped.end) {
          current.range = { start: snapped.start, end: snapped.end };
          setPreview(current.range);
        }
      }}
      onPointerUp={(event) => {
        const current = drag.current;
        drag.current = null;
        setPreview(null);
        onSnap(null);
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId);
        if (current?.moved) props.onChangeEdit?.(edit, { kind: 'range', ...current.range });
      }}
      onPointerCancel={() => {
        drag.current = null;
        setPreview(null);
        onSnap(null);
      }}
    >
      <button
        type="button"
        aria-label={`${label} ${reviewTimeLabel(edit.start)} – ${reviewTimeLabel(edit.end)}`}
        className="absolute inset-0 flex cursor-grab items-center justify-center gap-1
            overflow-hidden px-3 active:cursor-grabbing"
        onClick={(event) => {
          if (event.detail === 0) props.onEdit?.(edit);
        }}
      >
        {edit.kind === 'cut' ? <Scissors size={12} /> : <Gauge size={12} />}
        <span className="truncate">{label}</span>
      </button>
      {(['start', 'end'] as const).map((edge) => (
        <ReviewEditEdge
          key={edge}
          edge={edge}
          edit={edit}
          boundaries={props.boundaries}
          onChangeEdit={props.onChangeEdit}
        />
      ))}
    </div>
  );
}

/** Pointer and keyboard resizing of one edit edge; keyboard steps follow the media boundaries. */
function ReviewEditEdge(props: {
  edge: 'start' | 'end';
  edit: ReviewEdit;
  boundaries: readonly number[] | undefined;
  onChangeEdit: ((edit: ReviewEdit, range: ReviewAnchor) => void) | undefined;
}) {
  return (
    <button
      type="button"
      data-edge={props.edge}
      aria-label={translate(
        props.edge === 'start' ? 'gallery.videoReview.resizeStart' : 'gallery.videoReview.resizeEnd'
      )}
      className={`absolute inset-y-0 w-3 cursor-ew-resize rounded bg-black/10
          ${props.edge === 'start' ? 'left-0' : 'right-0'}`}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        event.stopPropagation();
        const choices = props.boundaries ?? [];
        const next =
          event.key === 'ArrowRight'
            ? choices.find((value) => value > props.edit[props.edge])
            : [...choices].reverse().find((value) => value < props.edit[props.edge]);
        if (next !== undefined)
          props.onChangeEdit?.(props.edit, {
            kind: 'range',
            start: props.edit.start,
            end: props.edit.end,
            [props.edge]: next,
          });
      }}
    >
      <span aria-hidden="true" className="mx-auto block h-4 w-px bg-current opacity-50" />
    </button>
  );
}

/** Trim snaps only the dragged edge; a whole-block move keeps both edges magnetic. */
function snapReviewEditDrag(args: {
  edge: 'start' | 'end' | 'move';
  start: number;
  end: number;
  duration: number;
  widthPx: number;
  bypass: boolean;
  edits: readonly ReviewEdit[] | undefined;
  boundaries: readonly number[] | undefined;
  playhead: number;
}): { start: number; end: number; guide: number | null } {
  if (args.bypass || !args.edits || args.widthPx <= 0)
    return { start: args.start, end: args.end, guide: null };
  const threshold = (SNAP_THRESHOLD_PX * args.duration) / args.widthPx;
  const candidates = getSnapCandidates({
    edits: args.edits,
    playhead: args.playhead,
    ...(args.boundaries ? { boundaries: args.boundaries } : {}),
  });
  let guide: number | null = null;
  let { start, end } = args;
  if (args.edge !== 'end') {
    const snap = snapTimelineTime(start, candidates, threshold);
    start = snap.time;
    guide = snap.candidate;
  }
  if (args.edge !== 'start') {
    const snap = snapTimelineTime(end, candidates, threshold);
    end = snap.time;
    guide = snap.candidate ?? guide;
  }
  return { start, end, guide };
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
