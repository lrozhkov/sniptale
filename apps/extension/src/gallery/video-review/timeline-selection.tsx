import { ReviewTimelineLabel } from './timeline-label';
import { reviewTimelineItemTone, reviewTimelineResizeHandleClassName } from './controls';
import { useRef, useState } from 'react';
import { Film, Scissors, Gauge } from 'lucide-react';
import { translate } from '../../platform/i18n';
import type { ReviewAnchor, ReviewAnnotation, ReviewEdit } from '../../features/video/review/types';
import {
  SNAP_THRESHOLD_PX,
  getSnapCandidates,
  snapTimelineTime,
} from '../../features/video/review/snap';
import { reviewTimeLabel } from './controls';
import { ReviewTrackRow } from './track-row';
import { ReviewCommentMarkers } from './timeline-comment-markers';
import { useReviewDragEscape } from './timeline-drag';

type SelectionProps = {
  duration: number;
  time: number;
  selection: ReviewAnchor;
  annotations: readonly ReviewAnnotation[];
  edits?: readonly ReviewEdit[];
  selectedEditId?: string | undefined;
  boundaries?: readonly number[];
  onEdit?(edit: ReviewEdit): void;
  onChangeEdit?(edit: ReviewEdit, range: ReviewAnchor): void | Promise<void>;
  onSeek(time: number): void;
  onSelect(value: ReviewAnchor): void;
  onComment(annotation: ReviewAnnotation): void;
};
const percent = (time: number, duration: number) => `${(time / duration) * 100}%`;

/** One source lane; existing edits can be moved or resized directly. */
export function ReviewSourceLane(props: SelectionProps) {
  const [guide, setGuide] = useState<number | null>(null);
  return (
    <ReviewTrackRow
      label={translate('gallery.videoReview.sourceVideo')}
      icon={<Film size={14} aria-hidden="true" />}
    >
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
        {props.selection.kind === 'range' && !props.selectedEditId ? (
          <div
            data-ui="gallery.videoReview.sourceRange"
            className="pointer-events-none absolute inset-y-0 border
              border-[var(--sniptale-color-accent)] bg-transparent"
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
    </ReviewTrackRow>
  );
}

function ReviewEditBlock(
  props: SelectionProps & { edit: ReviewEdit; onSnap(guide: number | null): void }
) {
  const { edit, duration, onSnap } = props;
  const [preview, setPreview] = useState<{ start: number; end: number } | null>(null);
  const [dragEdge, setDragEdge] = useState<'start' | 'end' | 'move' | null>(null);
  const drag = useRef<{
    x: number;
    width: number;
    edge: 'start' | 'end' | 'move';
    range: { start: number; end: number };
    moved: boolean;
    node: HTMLDivElement;
    pointerId: number;
  } | null>(null);
  useReviewDragEscape(drag, () => {
    setPreview(null);
    setDragEdge(null);
    onSnap(null);
  });
  const committing = useRef(false);
  const range = preview ?? edit;
  const { name, value, caption, covered, position } = reviewEditPresentation(edit, props.edits);
  const selected = props.selectedEditId === edit.id;
  return (
    <div
      data-ui="gallery.videoReview.editBlock"
      data-cut-suppressed={covered.length ? 'true' : 'false'}
      title={caption}
      className={`absolute rounded border text-xs ${position} ${reviewTimelineItemTone(selected, edit.kind)}`}
      data-drag-edge={dragEdge ?? undefined}
      style={{
        left: percent(range.start, duration),
        width: percent(range.end - range.start, duration),
        cursor: dragEdge === 'move' ? 'grabbing' : dragEdge ? 'ew-resize' : undefined,
      }}
      onPointerDown={(event) => {
        if (event.button !== 0 || committing.current) return;
        event.stopPropagation();
        const target = event.target;
        const edge =
          target instanceof Element
            ? target.closest('[data-edge]')?.getAttribute('data-edge')
            : null;
        setDragEdge(edge === 'start' || edge === 'end' ? edge : 'move');
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
      onPointerUp={async (event) => {
        const current = drag.current;
        drag.current = null;
        setDragEdge(null);
        onSnap(null);
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId);
        committing.current = true;
        try {
          if (current?.moved) await props.onChangeEdit?.(edit, { kind: 'range', ...current.range });
        } finally {
          committing.current = false;
          setPreview(null);
        }
      }}
      onPointerCancel={() => {
        drag.current = null;
        setDragEdge(null);
        setPreview(null);
        onSnap(null);
      }}
    >
      <button
        type="button"
        aria-label={caption}
        aria-pressed={selected}
        className="absolute inset-0 flex cursor-grab items-center justify-center gap-1
            overflow-hidden px-3 active:cursor-grabbing"
        onClick={(event) => {
          if (event.detail === 0) props.onEdit?.(edit);
        }}
      >
        <ReviewTimelineLabel
          icon={edit.kind === 'cut' ? <Scissors size={12} /> : <Gauge size={12} />}
          name={name}
          value={value}
        />
      </button>
      <ReviewSpeedCutMasks edit={edit} cuts={covered} />
      {(['start', 'end'] as const).map((edge) => (
        <ReviewEditEdge
          key={edge}
          edge={edge}
          duration={duration}
          edit={edit}
          boundaries={props.boundaries}
          onChangeEdit={props.onChangeEdit}
        />
      ))}
    </div>
  );
}

/** Source-lane cut/speed geometry keeps both edit kinds selectable during an overlap. */
function reviewEditPresentation(edit: ReviewEdit, edits: readonly ReviewEdit[] | undefined) {
  const { name, value, label } = reviewEditCaption(edit);
  const overlap =
    edits?.some(
      (item) => item.kind !== edit.kind && item.start < edit.end && item.end > edit.start
    ) ?? false;
  const covered =
    edit.kind === 'speed'
      ? (edits?.filter(
          (item) => item.kind === 'cut' && item.start < edit.end && item.end > edit.start
        ) ?? [])
      : [];
  const hint = covered.length ? ` · ${translate('gallery.videoReview.cutOverlapHint')}` : '';
  const position = overlap
    ? edit.kind === 'cut'
      ? 'top-1 bottom-[52%] z-[6]'
      : 'top-[52%] bottom-1 z-[5]'
    : 'inset-y-1 z-[5]';
  return {
    name,
    value,
    covered,
    position,
    caption: `${label} · ${reviewTimeLabel(edit.start)} – ${reviewTimeLabel(edit.end)}${hint}`,
  };
}

/** Only the source span hidden by a cut receives the disabled treatment. */
function ReviewSpeedCutMasks(props: { edit: ReviewEdit; cuts: readonly ReviewEdit[] }) {
  const edit = props.edit;
  return props.cuts.map((cut) => (
    <span
      key={cut.id}
      aria-hidden="true"
      className="pointer-events-none absolute inset-y-0 border-x border-dashed
        border-[var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-panel)]/65"
      style={{
        left: percent(Math.max(cut.start, edit.start) - edit.start, edit.end - edit.start),
        width: percent(
          Math.min(cut.end, edit.end) - Math.max(cut.start, edit.start),
          edit.end - edit.start
        ),
      }}
    />
  ));
}

/** One complete caption feeds the tooltip, accessible label and responsive visible parts. */
function reviewEditCaption(edit: ReviewEdit) {
  const name = translate(
    edit.kind === 'cut' ? 'gallery.videoReview.cutLabel' : 'gallery.videoReview.speedMode'
  );
  const value =
    edit.kind === 'speed' ? `${edit.rate < 0.25 ? `1/${1 / edit.rate}` : edit.rate}×` : undefined;
  return { name, value, label: value ? `${name} ${value}` : name };
}

/** Pointer and keyboard resizing of one edit edge; keyboard steps follow the media boundaries. */
function ReviewEditEdge(props: {
  edge: 'start' | 'end';
  duration: number;
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
      className={`${reviewTimelineResizeHandleClassName}
          ${props.edge === 'start' ? 'left-0' : 'right-0'}`}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        event.stopPropagation();
        const choices = props.boundaries ?? [];
        const step = event.shiftKey ? 1 : 1 / 30;
        const next = !props.boundaries
          ? Math.max(
              0,
              Math.min(
                props.duration,
                props.edit[props.edge] + (event.key === 'ArrowRight' ? step : -step)
              )
            )
          : event.key === 'ArrowRight'
            ? choices.find((value) => value > props.edit[props.edge])
            : [...choices].reverse().find((value) => value < props.edit[props.edge]);
        if (
          next !== undefined &&
          (props.edge === 'start' ? next < props.edit.end : next > props.edit.start)
        )
          props.onChangeEdit?.(props.edit, {
            kind: 'range',
            start: props.edit.start,
            end: props.edit.end,
            [props.edge]: next,
          });
      }}
    >
      <span aria-hidden="true" className="h-4 w-px bg-current opacity-60" />
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
