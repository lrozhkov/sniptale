import { deferReviewGesture, type ReviewBeforeAction } from './note-transitions';
import { ReviewTimelineLabel } from './timeline-label';
import { reviewTimelineItemTone, reviewTimelineResizeHandleClassName } from './controls';
import { useRef, useState } from 'react';
import { Film, Scissors, Gauge } from 'lucide-react';
import { translate } from '../../platform/i18n';
import type { ReviewAnchor, ReviewAnnotation, ReviewEdit } from '../../features/video/review/types';
import { reviewTimeLabel } from './controls';
import { ReviewTrackRow } from './track-row';
import { ReviewCommentMarkers } from './timeline-comment-markers';
import { useReviewDragEscape } from './timeline-drag';
import { snapReviewEditDrag } from './timeline-edit-snap';

type SelectionProps = {
  beforeAction?: ReviewBeforeAction | undefined;
  rangeEnabled?: boolean;
  duration: number;
  time: number;
  selection: ReviewAnchor;
  annotations: readonly ReviewAnnotation[];
  edits?: readonly ReviewEdit[];
  selectedEditId?: string | undefined;
  boundaries?: readonly number[];
  snapToKeyframes?: boolean;
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
        className={`relative h-12 rounded bg-[var(--sniptale-color-surface-hover)]
          ${props.annotations.length ? 'mt-6' : 'mt-1'}`}
      >
        {guide !== null ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 z-20 w-px
              bg-[var(--sniptale-color-accent-emphasis)]"
            style={{ left: percent(guide, props.duration) }}
          />
        ) : null}
        {props.rangeEnabled !== false &&
        props.selection.kind === 'range' &&
        !props.selectedEditId ? (
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
    admission: ReturnType<typeof deferReviewGesture>;
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
        if (props.rangeEnabled === false || event.button !== 0 || committing.current) return;
        event.stopPropagation();
        const target = event.target;
        const edge =
          target instanceof Element
            ? target.closest('[data-edge]')?.getAttribute('data-edge')
            : null;
        setDragEdge(edge === 'start' || edge === 'end' ? edge : 'move');
        drag.current = {
          admission: deferReviewGesture(props.beforeAction, () => props.onEdit?.(edit)),
          x: event.clientX,
          width: event.currentTarget.parentElement!.getBoundingClientRect().width,
          edge: edge === 'start' || edge === 'end' ? edge : 'move',
          range: { start: edit.start, end: edit.end },
          moved: false,
          node: event.currentTarget,
          pointerId: event.pointerId,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const current = drag.current;
        if (!current || current.width <= 0) return;
        current.moved ||= Math.abs(event.clientX - current.x) > 3;
        const snapped = snapReviewEditDrag({
          edge: current.edge,
          deltaPx: event.clientX - current.x,
          duration,
          widthPx: current.width,
          bypass: event.shiftKey,
          edits: props.edits,
          boundaries: props.boundaries,
          playhead: props.time,
          current: edit,
          keyframeMove: !!props.snapToKeyframes,
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
        if (!current) return;
        current.admission.commit(async () => {
          committing.current = true;
          try {
            if (
              current?.moved &&
              (current.range.start !== edit.start || current.range.end !== edit.end)
            )
              await props.onChangeEdit?.(edit, { kind: 'range', ...current.range });
          } finally {
            committing.current = false;
            setPreview(null);
          }
        });
      }}
      onPointerCancel={() => {
        drag.current?.admission.cancel();
        drag.current = null;
        setDragEdge(null);
        setPreview(null);
        onSnap(null);
      }}
    >
      <button
        type="button"
        aria-label={caption}
        disabled={props.rangeEnabled === false}
        aria-pressed={selected}
        className="absolute inset-0 flex cursor-grab items-center justify-center gap-1
            overflow-hidden px-3 active:cursor-grabbing disabled:cursor-default"
        onClick={(event) => {
          if (event.detail === 0)
            (props.beforeAction ?? ((action) => action()))(() => props.onEdit?.(edit));
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
          disabled={props.rangeEnabled === false}
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
  disabled: boolean;
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
      disabled={props.disabled}
      aria-label={translate(
        props.edge === 'start' ? 'gallery.videoReview.resizeStart' : 'gallery.videoReview.resizeEnd'
      )}
      className={`${reviewTimelineResizeHandleClassName} disabled:cursor-default
          ${props.edge === 'start' ? 'left-0' : 'right-0'}`}
      onKeyDown={(event) => {
        if (props.disabled || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
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
