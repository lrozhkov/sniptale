import { useReviewTimelineSnap, type ReviewTimelineSnap } from './timeline-magnets';
import { SNAP_THRESHOLD_PX, snapTimelineTime } from '../../features/video/review/snap';
import {
  reviewTrackMetrics,
  ReviewTrackRow,
  ReviewTrackCuts,
  ReviewTrackVisibilityButton,
} from './track-row';
import { useReviewResizeBoundary } from './timeline-resize-guide';
import { Captions, ClosedCaption } from 'lucide-react';
import { useRef, useState } from 'react';
import type { ReviewTextFragment } from '../../features/video/review/text-document';
import { packReviewTextRows } from '../../features/video/review/text-projection';
import type { useReviewText } from './use-review-text';
import { deferReviewGesture, type ReviewBeforeAction } from './note-transitions';
import { useReviewDragEscape } from './timeline-drag';
import { translate } from '../../platform/i18n';
import {
  reviewTimeLabel,
  reviewTimelineItemTone,
  reviewTimelineResizeHandleClassName,
  reviewTrackStatusButtonClassName,
} from './controls';

/** Independent text shares track rows, source-axis gestures and the existing inspector. */
type TextTrackProps = {
  editor: ReturnType<typeof useReviewText>;
  selectedId?: string | undefined;
  busy: boolean;
  compact?: boolean | undefined;
  beforeAction?: ReviewBeforeAction | undefined;
  onSelect(id: string): void;
  onToggleCaptions?: (() => void) | undefined;
};

export function ReviewTextTrack(props: TextTrackProps) {
  const gesture = useReviewTextTrackGesture(props);
  const preview = gesture.preview;
  const fragments = props.editor.document.fragments.map((fragment) =>
    preview?.id === fragment.id ? preview : fragment
  );
  const ranges = fragments.map((fragment) => ({
    id: fragment.id,
    ...props.editor.sourceInterval(fragment),
  }));
  const rows = packReviewTextRows(ranges);
  const rowCount = Math.max(1, ...Array.from(rows.values(), (row) => row + 1));
  const metrics = reviewTrackMetrics(props.compact);
  const step = metrics.step;
  return (
    <ReviewTrackRow
      track="text"
      label={translate('gallery.videoReview.textTrack')}
      icon={<Captions size={14} aria-hidden />}
      controls={
        <ReviewTrackVisibilityButton
          track="text"
          label={translate('gallery.videoReview.captionsEnabled')}
          aria-pressed={props.editor.captions.enabled}
          className={`${reviewTrackStatusButtonClassName} !w-7 !min-h-7 !h-7 !px-0`}
          disabled={props.busy || !props.onToggleCaptions}
          onClick={() =>
            (props.beforeAction ?? ((action) => action()))(() => props.onToggleCaptions?.())
          }
        >
          <ClosedCaption size={14} aria-hidden />
        </ReviewTrackVisibilityButton>
      }
    >
      <div
        data-ui="gallery.videoReview.textTrack"
        className="relative rounded bg-[var(--sniptale-color-surface-hover)]"
        style={{ height: rowCount * step }}
      >
        {fragments.map((fragment) => {
          const range = props.editor.sourceInterval(fragment);
          const left = props.editor.projection.display.sourceToDisplay(range.start);
          const right = props.editor.projection.display.sourceToDisplay(range.end, 'end');
          return (
            <div
              key={fragment.id}
              role="button"
              tabIndex={props.busy ? -1 : 0}
              aria-label={[
                fragment.text || translate('gallery.videoReview.speechText'),
                `${reviewTimeLabel(range.start)}–${reviewTimeLabel(range.end)}`,
              ].join(' · ')}
              aria-pressed={props.selectedId === fragment.id}
              aria-disabled={props.busy}
              data-text-id={fragment.id}
              data-review-removal-key={`text:${fragment.id}`}
              data-review-snap-start={range.start}
              data-review-snap-end={range.end}
              data-dragging={gesture.draggingId === fragment.id ? 'true' : undefined}
              className={[
                'absolute min-w-px touch-none select-none overflow-hidden rounded border px-3 text-left text-[11px]',
                reviewTimelineItemTone(props.selectedId === fragment.id),
              ].join(' ')}
              style={{
                top: (rows.get(fragment.id) ?? 0) * step + metrics.inset,
                height: metrics.body,
                left: `${(left / props.editor.projection.display.duration) * 100}%`,
                width: `${(Math.max(0, right - left) / props.editor.projection.display.duration) * 100}%`,
              }}
              onKeyDown={(event) => {
                if (props.busy || (event.key !== 'Enter' && event.key !== ' ')) return;
                event.preventDefault();
                (props.beforeAction ?? ((action) => action()))(() => props.onSelect(fragment.id));
              }}
              onPointerDown={(event) => gesture.start(event, fragment)}
              onPointerMove={gesture.move}
              onPointerUp={gesture.finish}
              onPointerCancel={gesture.cancel}
              onLostPointerCapture={gesture.cancel}
            >
              <span className="flex h-full items-center">
                <span
                  className="block min-w-0 truncate
                  text-[color:var(--review-item-foreground,var(--sniptale-color-text-secondary))]
                  font-[number:var(--review-label-weight,400)]"
                >
                  {fragment.text || translate('gallery.videoReview.speechText')}
                </span>
              </span>
              {(['start', 'end'] as const).map((edge) => (
                <span
                  key={edge}
                  data-text-edge={edge}
                  className={`${reviewTimelineResizeHandleClassName} ${edge === 'start' ? 'left-0' : 'right-0'}`}
                ></span>
              ))}
            </div>
          );
        })}
        <ReviewTrackCuts projection={props.editor.projection} />
      </div>
    </ReviewTrackRow>
  );
}

/** One pointer capture owns the disposable preview, admission, Escape and final timing commit. */
function useReviewTextTrackGesture(props: TextTrackProps) {
  const snap = useReviewTimelineSnap();
  const drag = useRef<{
    base: ReviewTextFragment;
    x: number;
    width: number;
    edge: 'start' | 'end' | 'move';
    node: HTMLElement;
    pointerId: number;
    admission: ReturnType<typeof deferReviewGesture>;
  } | null>(null);
  const [preview, setPreview] = useState<ReviewTextFragment | null>(null);
  const previewRef = useRef<ReviewTextFragment | null>(null);
  const boundary = drag.current;
  const boundaryRange = preview ? props.editor.sourceInterval(preview) : null;
  useReviewResizeBoundary(
    boundary,
    boundary &&
      boundary.edge !== 'move' &&
      boundaryRange &&
      props.editor.document.fragments.some((fragment) => fragment.id === boundary.base.id)
      ? boundaryRange[boundary.edge]
      : null,
    boundary?.base,
    preview
  );
  const clearPreview = () => {
    previewRef.current = null;
    setPreview(null);
  };
  useReviewDragEscape(drag, clearPreview);
  const duration = Math.max(0.01, props.editor.projection.duration);
  const cancel = () => {
    const current = drag.current;
    drag.current = null;
    current?.admission.cancel();
    if (current?.node.hasPointerCapture(current.pointerId))
      current.node.releasePointerCapture(current.pointerId);
    clearPreview();
  };
  const start = (event: React.PointerEvent<HTMLDivElement>, fragment: ReviewTextFragment) => {
    if (props.busy || event.button !== 0) return;
    event.stopPropagation();
    const bounds = event.currentTarget.parentElement?.getBoundingClientRect();
    if (!bounds || bounds.width <= 0) return;
    const edge =
      event.target instanceof Element
        ? event.target.closest('[data-text-edge]')?.getAttribute('data-text-edge')
        : null;
    drag.current = {
      base: fragment,
      x: event.clientX,
      width: bounds.width,
      edge: edge === 'start' || edge === 'end' ? edge : 'move',
      node: event.currentTarget,
      pointerId: event.pointerId,
      admission: deferReviewGesture(props.beforeAction, () => props.onSelect(fragment.id)),
    };
    previewRef.current = fragment;
    setPreview(fragment);
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const move = (event: React.PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current) return;
    const base = current.base;
    const limit = base.timeDomain === 'source' ? duration : props.editor.projection.resultDuration;
    const sourceRange = props.editor.sourceInterval(base);
    const sourceAnchor = current.edge === 'end' ? sourceRange.end : sourceRange.start;
    const freeDelta =
      base.timeDomain === 'source'
        ? props.editor.projection.focus.delta(
            props.editor.projection.focus.source(base.start),
            event.clientX - current.x,
            current.width
          )
        : props.editor.projection.delta(sourceAnchor, event.clientX - current.x, current.width);
    const delta = textResizeDelta(props.editor, current, freeDelta, event.altKey, snap);
    const shift = Math.max(-base.start, Math.min(limit - base.end, delta));
    const start =
      current.edge === 'move'
        ? base.start + shift
        : current.edge === 'start'
          ? Math.max(0, Math.min(base.end - 0.01, base.start + delta))
          : base.start;
    const end =
      current.edge === 'move'
        ? base.end + shift
        : current.edge === 'end'
          ? Math.min(limit, Math.max(base.start + 0.01, base.end + delta))
          : base.end;
    const next = { ...base, start, end };
    delete next.sourceAnchor;
    previewRef.current = next;
    setPreview(next);
  };
  const finish = () => {
    const current = drag.current;
    if (!current) return;
    drag.current = null;
    const next = previewRef.current;
    clearPreview();
    if (current.node.hasPointerCapture(current.pointerId))
      current.node.releasePointerCapture(current.pointerId);
    if (next && (next.start !== current.base.start || next.end !== current.base.end))
      current.admission.commit(() =>
        props.editor.change(
          current.base.id,
          { start: next.start, end: next.end },
          current.base.timingRevision
        )
      );
  };
  return { preview, draggingId: drag.current?.base.id, start, move, finish, cancel };
}

/** Snap in visible source pixels, then return a delta in the fragment's own clock. */
function textResizeDelta(
  editor: TextTrackProps['editor'],
  gesture: { base: ReviewTextFragment; edge: 'start' | 'end' | 'move'; width: number },
  delta: number,
  bypass: boolean,
  snapTime: ReviewTimelineSnap = snapTimelineTime
) {
  if (bypass) return delta;
  const { base, edge, width } = gesture;
  const sourceClock = base.timeDomain === 'source';
  const playhead = editor.playhead(base);
  const candidates = [
    0,
    editor.projection.duration,
    sourceClock ? playhead : editor.projection.source(playhead),
    ...editor.document.fragments
      .filter((fragment) => fragment.id !== base.id)
      .flatMap((fragment) => {
        const span = editor.sourceInterval(fragment);
        return [span.start, span.end];
      }),
  ];
  const threshold = (SNAP_THRESHOLD_PX * editor.projection.duration) / Math.max(1, width);
  const snappedDelta = (boundary: 'start' | 'end') => {
    const requested = base[boundary] + delta;
    const time = sourceClock ? requested : editor.projection.source(requested, boundary);
    const snap = snapTime(time, candidates, threshold);
    return {
      delta:
        snap.candidate === null
          ? delta
          : (sourceClock ? snap.time : editor.projection.output(snap.time)) - base[boundary],
      distance: snap.candidate === null ? Infinity : Math.abs(snap.time - time),
    };
  };
  if (edge !== 'move') return snappedDelta(edge).delta;
  const start = snappedDelta('start'),
    end = snappedDelta('end');
  return start.distance <= end.distance ? start.delta : end.delta;
}
