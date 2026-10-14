import { reviewTrackGestureLocked } from './track-row';
import { useReviewResizeBoundary } from './timeline-resize-guide';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Eye, EyeOff, Sticker } from 'lucide-react';
import { translate, useAppLocale } from '../../platform/i18n';
import type {
  ReviewAnnotationEffect,
  ReviewAnnotationEffectSnapshot,
} from '../../features/video/review/annotation-effects/types';
import { readReviewAnnotationEffectDocument } from '../../features/video/review/annotation-effects/validation';
import { SNAP_THRESHOLD_PX, snapTimelineTime } from '../../features/video/review/snap';
import {
  ReviewButton,
  reviewTimeLabel,
  reviewTimelineItemTone,
  reviewTimelineResizeHandleClassName,
  reviewTrackStatusButtonClassName,
} from './controls';
import { deferReviewGesture, type ReviewBeforeAction } from './note-transitions';
import { useReviewDragEscape } from './timeline-drag';
import { ReviewTrackCuts, ReviewTrackRow } from './track-row';
import { ReviewTimelineLabel } from './timeline-label';
import type { ReviewTrackProjection } from './track-projection';

type Range = Pick<ReviewAnnotationEffect, 'start' | 'end'>;
type Drag = {
  id: string | null;
  before: Range;
  after: Range;
  edge: 'start' | 'end' | 'move' | 'draw';
  moved?: boolean;
  x: number;
  width: number;
  node: HTMLDivElement;
  pointerId: number;
  ready: boolean;
  ended: boolean;
  admission?: ReturnType<typeof deferReviewGesture>;
};

type TrackProps = {
  instances: readonly ReviewAnnotationEffect[];
  snapshots: readonly ReviewAnnotationEffectSnapshot[];
  duration: number;
  time: number;
  enabled: boolean;
  busy: boolean;
  drawing?: boolean;
  onPlace?(range: { start: number; end?: number }, anchor: HTMLElement): void;
  compact?: boolean;
  projection?: ReviewTrackProjection;
  selectedId: string | null;
  snapTimes: readonly number[];
  beforeAction?: ReviewBeforeAction | undefined;
  onEnabled(enabled: boolean): void;
  onSelect(id: string): void;
  onBegin(id: string): boolean;
  onPreview(range: Range): void;
  onCommit(): void;
  onCancel(): void;
};

function boundedRange(
  before: Range,
  edge: Exclude<Drag['edge'], 'draw'>,
  delta: number,
  duration: number
): Range {
  if (edge === 'move') {
    const start = Math.max(
      0,
      Math.min(duration - (before.end - before.start), before.start + delta)
    );
    return { start, end: start + before.end - before.start };
  }
  if (edge === 'start')
    return {
      start: Math.max(0, Math.min(before.end - 0.001, before.start + delta)),
      end: before.end,
    };
  return {
    start: before.start,
    end: Math.min(duration, Math.max(before.start + 0.001, before.end + delta)),
  };
}

/** Source-clock plates; overlap rows are disposable and never change compositing order. */
export function ReviewAnnotationEffectsTrack(props: TrackProps) {
  const locale = useAppLocale();
  const drag = useRef<Drag | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const [preview, setPreview] = useState<(Range & { id: string | null }) | null>(null);
  const [guide, setGuide] = useState<number | null>(null);
  const boundary = drag.current;
  useReviewResizeBoundary(
    boundary,
    boundary &&
      boundary.ready &&
      !boundary.ended &&
      (boundary.edge === 'start' || boundary.edge === 'end') &&
      props.instances.some((instance) => instance.id === boundary.id)
      ? boundary.after[boundary.edge]
      : null
  );
  const reset = () => {
    setPreview(null);
    setGuide(null);
    latest.current.onCancel();
  };
  useReviewDragEscape(drag, reset);
  useEffect(
    () => () => {
      const current = drag.current;
      if (!current) return;
      current.admission?.cancel();
      latest.current.onCancel();
      if (current.node.hasPointerCapture(current.pointerId))
        current.node.releasePointerCapture(current.pointerId);
      drag.current = null;
    },
    []
  );
  const rows = useMemo(() => {
    const ends: number[] = [];
    const result = new Map<string, number>();
    for (const instance of [...props.instances].sort(
      (a, b) => a.start - b.start || a.order - b.order || a.id.localeCompare(b.id)
    )) {
      let row = ends.findIndex((end) => end <= instance.start);
      if (row < 0) row = ends.length;
      ends[row] = instance.end;
      result.set(instance.id, row);
    }
    return result;
  }, [props.instances]);
  const labels = useMemo(
    () =>
      new Map(
        props.snapshots
          .filter((snapshot) =>
            props.instances.some((instance) => instance.snapshotId === snapshot.id)
          )
          .map((snapshot) => {
            const document = readReviewAnnotationEffectDocument(snapshot.source);
            return [
              snapshot.id,
              document?.label[locale] ??
                document?.label.en ??
                translate('gallery.videoReview.annotationEffects'),
            ];
          })
      ),
    [props.snapshots, props.instances, locale]
  );
  const height = props.compact ? 28 : 36;
  const finish = (cancel: boolean) => {
    const current = drag.current;
    if (!current) return;
    current.ended = true;
    if (current.node.hasPointerCapture(current.pointerId))
      current.node.releasePointerCapture(current.pointerId);
    setPreview(null);
    setGuide(null);
    if (cancel) {
      drag.current = null;
      current.admission?.cancel();
      props.onCancel();
    } else
      current.admission?.commit(() => {
        if (drag.current === current) drag.current = null;
        if (!current.ready) return;
        if (current.edge === 'draw') {
          props.onPlace?.(
            current.moved && current.after.end - current.after.start >= 0.001
              ? current.after
              : { start: current.before.start },
            current.node
          );
        } else {
          props.onPreview(current.after);
          props.onCommit();
        }
      });
  };
  const latestFinish = useRef(finish);
  latestFinish.current = finish;
  useEffect(() => {
    if (!props.drawing && drag.current?.edge === 'draw') latestFinish.current(true);
  }, [props.drawing]);
  return (
    <ReviewTrackRow
      track="annotationEffects"
      muted={!props.enabled}
      label={translate('gallery.videoReview.annotationEffects')}
      icon={<Sticker size={14} aria-hidden />}
      controls={
        <ReviewButton
          label={translate('gallery.videoReview.annotationEffectsEnabled')}
          aria-pressed={props.enabled}
          disabled={props.busy}
          className={`${reviewTrackStatusButtonClassName} !h-7 !min-h-7 !w-7 !px-1`}
          onClick={() => props.onEnabled(!props.enabled)}
        >
          {props.enabled ? <Eye size={14} aria-hidden /> : <EyeOff size={14} aria-hidden />}
        </ReviewButton>
      }
    >
      <div
        data-ui="gallery.videoReview.annotationEffectsLane"
        tabIndex={props.drawing && !props.busy ? 0 : undefined}
        aria-label={
          props.drawing ? translate('gallery.videoReview.annotationEffectsDraw') : undefined
        }
        className={[
          'relative mt-1 rounded bg-[var(--sniptale-color-surface-hover)]',
          props.drawing
            ? [
                'cursor-inherit touch-none focus-visible:outline focus-visible:outline-2',
                'focus-visible:outline-[var(--sniptale-color-accent)]',
              ].join(' ')
            : '',
        ].join(' ')}
        style={{ height: Math.max(1, ...Array.from(rows.values(), (row) => row + 1)) * height - 4 }}
        onKeyDown={(event) => {
          if (
            !props.drawing ||
            props.busy ||
            event.target !== event.currentTarget ||
            event.key !== 'Enter'
          )
            return;
          event.preventDefault();
          event.stopPropagation();
          const node = event.currentTarget;
          const start = Math.max(0, Math.min(props.time, props.duration - 0.001));
          (props.beforeAction ?? ((action) => action()))(() => props.onPlace?.({ start }, node));
        }}
        onPointerDown={(event) => {
          if (
            !props.drawing ||
            props.busy ||
            event.button !== 0 ||
            drag.current ||
            reviewTrackGestureLocked(event.currentTarget)
          )
            return;
          event.preventDefault();
          event.stopPropagation();
          const bounds = event.currentTarget.getBoundingClientRect();
          const width = Math.max(1, bounds.width);
          const candidates = event.altKey
            ? []
            : [
                0,
                props.duration,
                props.time,
                ...props.snapTimes,
                ...props.instances.flatMap((item) => [item.start, item.end]),
              ];
          const time = Math.max(
            0,
            Math.min(
              props.duration - 0.001,
              snapTimelineTime(
                ((event.clientX - bounds.left) / width) * props.duration,
                candidates,
                event.altKey ? 0 : (SNAP_THRESHOLD_PX / width) * props.duration
              ).time
            )
          );
          const current: Drag = {
            id: null,
            before: { start: time, end: time },
            after: { start: time, end: time },
            edge: 'draw',
            x: event.clientX,
            width,
            node: event.currentTarget,
            pointerId: event.pointerId,
            ready: false,
            ended: false,
          };
          drag.current = current;
          current.admission = deferReviewGesture(props.beforeAction, () => {
            current.ready = true;
          });
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const current = drag.current;
          if (
            !current ||
            current.edge !== 'draw' ||
            current.ended ||
            current.pointerId !== event.pointerId
          )
            return;
          event.stopPropagation();
          const moved = Math.abs(event.clientX - current.x) >= 4;
          current.moved ||= moved;
          const candidates = event.altKey
            ? []
            : [
                0,
                props.duration,
                props.time,
                ...props.snapTimes,
                ...props.instances.flatMap((item) => [item.start, item.end]),
              ];
          const snap = snapTimelineTime(
            Math.max(
              0,
              Math.min(
                props.duration,
                current.before.start +
                  ((event.clientX - current.x) / current.width) * props.duration
              )
            ),
            candidates,
            event.altKey ? 0 : (SNAP_THRESHOLD_PX / current.width) * props.duration
          );
          current.after = {
            start: Math.min(current.before.start, snap.time),
            end: Math.max(current.before.start, snap.time),
          };
          setPreview({ id: null, ...current.after });
          setGuide(snap.candidate);
        }}
        onPointerUp={(event) => {
          if (drag.current?.edge !== 'draw' || drag.current.pointerId !== event.pointerId) return;
          event.stopPropagation();
          finish(false);
        }}
        onPointerCancel={() => {
          if (drag.current?.edge === 'draw') finish(true);
        }}
        onLostPointerCapture={() => {
          if (drag.current?.edge === 'draw' && !drag.current.ended) finish(true);
        }}
      >
        {preview?.id === null ? (
          <div
            aria-hidden
            data-annotation-effect-placement
            className={[
              'pointer-events-none absolute inset-y-0 z-20 rounded border',
              'border-[var(--sniptale-color-accent)] bg-[var(--sniptale-color-surface-hover)]',
              'opacity-70',
            ].join(' ')}
            style={{
              left: `${(preview.start / props.duration) * 100}%`,
              width: `${((preview.end - preview.start) / props.duration) * 100}%`,
            }}
          />
        ) : null}
        {props.instances.map((instance) => {
          const range = preview?.id === instance.id ? preview : instance;
          const name =
            labels.get(instance.snapshotId) ?? translate('gallery.videoReview.annotationEffects');
          const value = reviewTimeLabel(range.end - range.start);
          const interval = `${reviewTimeLabel(range.start)} – ${reviewTimeLabel(range.end)}`;
          return (
            <div
              key={instance.id}
              role="button"
              tabIndex={props.busy ? -1 : 0}
              aria-label={`${name} ${interval}`}
              aria-pressed={props.selectedId === instance.id}
              aria-disabled={props.busy}
              data-annotation-effect-id={instance.id}
              data-annotation-effect-row={rows.get(instance.id)}
              data-enabled={instance.enabled}
              title={`${name} ${interval}`}
              className={[
                'absolute touch-none cursor-grab overflow-hidden rounded border px-3 text-[11px]',
                'focus-visible:outline focus-visible:outline-2',
                'focus-visible:outline-[var(--sniptale-color-accent)]',
                reviewTimelineItemTone(props.selectedId === instance.id),
                instance.enabled ? '' : 'opacity-60',
              ].join(' ')}
              style={{
                left: `${(range.start / props.duration) * 100}%`,
                width: `${((range.end - range.start) / props.duration) * 100}%`,
                top: (rows.get(instance.id) ?? 0) * height + 2,
                height: height - 8,
              }}
              onKeyDown={(event) => {
                if (props.busy) return;
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  event.stopPropagation();
                  (props.beforeAction ?? ((action) => action()))(() => props.onSelect(instance.id));
                }
                if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
                event.preventDefault();
                event.stopPropagation();
                (props.beforeAction ?? ((action) => action()))(() => {
                  props.onSelect(instance.id);
                  if (!props.onBegin(instance.id)) return;
                  props.onPreview(
                    boundedRange(
                      instance,
                      event.shiftKey ? 'end' : 'move',
                      (event.key === 'ArrowLeft' ? -1 : 1) *
                        (event.ctrlKey || event.metaKey ? 1 : 0.1),
                      props.duration
                    )
                  );
                  props.onCommit();
                });
              }}
              onPointerDown={(event) => {
                event.stopPropagation();
                if (props.busy || event.button !== 0 || drag.current) return;
                if (reviewTrackGestureLocked(event.currentTarget)) {
                  props.onSelect(instance.id);
                  return;
                }
                const edge =
                  event.target instanceof Element
                    ? event.target
                        .closest('[data-annotation-effect-edge]')
                        ?.getAttribute('data-annotation-effect-edge')
                    : null;
                const current: Drag = {
                  id: instance.id,
                  before: { start: instance.start, end: instance.end },
                  after: { start: instance.start, end: instance.end },
                  edge: edge === 'start' || edge === 'end' ? edge : 'move',
                  x: event.clientX,
                  width: Math.max(
                    1,
                    event.currentTarget.parentElement?.getBoundingClientRect().width ?? 1
                  ),
                  node: event.currentTarget,
                  pointerId: event.pointerId,
                  ready: false,
                  ended: false,
                };
                drag.current = current;
                current.admission = deferReviewGesture(props.beforeAction, () => {
                  props.onSelect(instance.id);
                  current.ready = props.onBegin(instance.id);
                  if (current.ready) {
                    props.onPreview(current.after);
                    setPreview({ id: instance.id, ...current.after });
                  }
                });
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={(event) => {
                const current = drag.current;
                if (
                  !current ||
                  current.edge === 'draw' ||
                  current.ended ||
                  current.id !== instance.id ||
                  current.pointerId !== event.pointerId
                )
                  return;
                event.stopPropagation();
                let next = boundedRange(
                  current.before,
                  current.edge,
                  ((event.clientX - current.x) / current.width) * props.duration,
                  props.duration
                );
                const candidates = event.altKey
                  ? []
                  : [
                      0,
                      props.duration,
                      props.time,
                      ...props.snapTimes,
                      ...props.instances
                        .filter((item) => item.id !== instance.id)
                        .flatMap((item) => [item.start, item.end]),
                    ];
                const threshold = event.altKey
                  ? 0
                  : (SNAP_THRESHOLD_PX / current.width) * props.duration;
                const start = snapTimelineTime(next.start, candidates, threshold);
                const end = snapTimelineTime(next.end, candidates, threshold);
                const startDistance =
                  start.candidate === null ? Infinity : Math.abs(start.time - next.start);
                const endDistance =
                  end.candidate === null ? Infinity : Math.abs(end.time - next.end);
                const snap =
                  current.edge === 'start'
                    ? start
                    : current.edge === 'end'
                      ? end
                      : startDistance <= endDistance
                        ? start
                        : end;
                const requested =
                  current.edge === 'start'
                    ? snap.time - current.before.start
                    : current.edge === 'end'
                      ? snap.time - current.before.end
                      : next.start -
                        current.before.start +
                        (snap === start ? snap.time - next.start : snap.time - next.end);
                next = boundedRange(current.before, current.edge, requested, props.duration);
                current.after = next;
                setPreview({ id: instance.id, ...next });
                setGuide(current.edge === 'move' ? snap.candidate : null);
                if (current.ready) props.onPreview(next);
              }}
              onPointerUp={(event) => {
                event.stopPropagation();
                if (drag.current?.pointerId === event.pointerId) finish(false);
              }}
              onPointerCancel={() => finish(true)}
              onLostPointerCapture={() => {
                if (drag.current?.id === instance.id && !drag.current.ended) finish(true);
              }}
            >
              <ReviewTimelineLabel
                icon={<Sticker size={12} aria-hidden />}
                name={name}
                value={value}
              />
              <div
                data-annotation-effect-edge="start"
                aria-hidden
                className={`${reviewTimelineResizeHandleClassName} left-0`}
              >
                <span className="h-2.5 border-l border-current" />
              </div>
              <div
                data-annotation-effect-edge="end"
                aria-hidden
                className={`${reviewTimelineResizeHandleClassName} right-0`}
              >
                <span className="h-2.5 border-l border-current" />
              </div>
            </div>
          );
        })}
        <ReviewTrackCuts projection={props.projection} />
        {guide !== null ? (
          <div
            aria-hidden
            data-annotation-effect-guide
            className="pointer-events-none absolute inset-y-0 z-20 w-px bg-[var(--sniptale-color-accent-emphasis)]"
            style={{ left: `${(guide / props.duration) * 100}%` }}
          />
        ) : null}
        {!props.instances.length ? (
          <p
            className={[
              'pointer-events-none absolute inset-0 flex items-center justify-center text-[11px]',
              'text-[var(--sniptale-color-text-muted)]',
            ].join(' ')}
          >
            {translate('gallery.videoReview.annotationEffectsEmpty')}
          </p>
        ) : null}
      </div>
    </ReviewTrackRow>
  );
}
