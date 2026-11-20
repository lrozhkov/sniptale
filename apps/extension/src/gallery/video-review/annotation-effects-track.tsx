import {
  anchorReviewVisualDisplay,
  displayReviewVisualAnchor,
} from '../../features/video/review/visual-anchor';
import { reviewTimelineHint } from './timeline-hints';
import { ReviewPlaybackPresentationClockContext } from './playback-presentation-clock';
import { useReviewTimelineSnap } from './timeline-magnets';
import { ReviewTrackVisibilityButton } from './track-row';
import { reviewTrackMetrics, ReviewTrackCuts, ReviewTrackRow } from './track-row';
import { useReviewResizeBoundary } from './timeline-resize-guide';
import { memo, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Eye, EyeOff, Sticker } from 'lucide-react';
import { translate, useAppLocale } from '../../platform/i18n';
import type {
  ReviewAnnotationEffect,
  ReviewAnnotationEffectSnapshot,
  ReviewAnnotationTextClip,
} from '../../features/video/review/annotation-effects/types';
import { readReviewAnnotationEffectDocument } from '../../features/video/review/annotation-effects/validation';
import { SNAP_THRESHOLD_PX } from '../../features/video/review/snap';
import {
  reviewTimeLabel,
  reviewTimelineItemTone,
  reviewTimelineResizeHandleClassName,
  reviewTrackStatusButtonClassName,
} from './controls';
import { deferReviewGesture, type ReviewBeforeAction } from './note-transitions';
import { useReviewDragEscape } from './timeline-drag';
import { ReviewTimelineLabel } from './timeline-label';
import type { ReviewTrackProjection } from './track-projection';

type Range = Pick<ReviewAnnotationEffect, 'start' | 'end' | 'timeDomain' | 'visualAnchor'>;
type ResultRange = Pick<Range, 'start' | 'end'>;
type TrackRange = Range & { result?: ResultRange };
type TimelineClip = TrackRange & {
  id: string;
  enabled: boolean;
  order: number;
  snapshotId?: string;
  text?: string;
};
type Drag = {
  id: string | null;
  before: TrackRange;
  after: TrackRange;
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
  textClips?: readonly ReviewAnnotationTextClip[] | undefined;
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

function proposeAnnotationRange(
  before: TrackRange,
  edge: Exclude<Drag['edge'], 'draw'>,
  target: number,
  displayDuration: number,
  projection: ReviewTrackProjection | undefined,
  moveAnchor: 'start' | 'end' = 'start'
): TrackRange {
  const boundary = edge === 'move' ? moveAnchor : edge;
  if (!before.result || !projection)
    return boundedRange(before, edge, target - before[boundary], displayDuration);
  const { resultDuration, display } = projection;
  const original = before.result;
  const span = original.end - original.start;
  const minimum = Math.min(0.001, span);
  const at = display.displayToResult(target);
  let result: ResultRange;
  if (edge === 'move') {
    const latestStart =
      original.end > resultDuration ? resultDuration - minimum : resultDuration - span;
    const start = Math.max(0, Math.min(at - (boundary === 'end' ? span : 0), latestStart));
    result = { start, end: start + span };
  } else if (edge === 'start') {
    result = {
      start: Math.max(0, Math.min(at, original.end - minimum, resultDuration - minimum)),
      end: original.end,
    };
  } else {
    result = {
      start: original.start,
      end: Math.min(resultDuration, Math.max(at, original.start + minimum)),
    };
  }
  return {
    result,
    start: display.resultToDisplay(result.start),
    end: display.resultToDisplay(Math.min(result.end, resultDuration), 'end'),
  };
}

/** Source-clock plates; overlap rows are disposable and never change compositing order. */
export function ReviewAnnotationEffectsTrack(incoming: TrackProps) {
  const display = incoming.projection?.display;
  const duration = incoming.projection?.resultDuration ?? incoming.duration;
  const instances = useMemo<readonly TimelineClip[]>(
    () => [
      ...incoming.instances.map((item) =>
        display
          ? {
              ...item,
              start: item.visualAnchor
                ? displayReviewVisualAnchor(item, display)
                : item.timeDomain === 'result'
                  ? display.resultToDisplay(item.start)
                  : display.sourceToDisplay(item.start),
              end: item.visualAnchor
                ? displayReviewVisualAnchor(item, display, item.end - item.start)
                : item.timeDomain === 'result'
                  ? display.resultToDisplay(item.end, 'end')
                  : display.sourceToDisplay(item.end, 'end'),
            }
          : item
      ),
      ...(incoming.textClips ?? []).flatMap((clip) => {
        if (clip.start >= duration) return [];
        const end = Math.min(duration, clip.end);
        return [
          {
            id: clip.id,
            enabled: clip.enabled,
            order: clip.order,
            text: clip.text,
            ...(display ? { result: { start: clip.start, end: clip.end } } : {}),
            start: display?.resultToDisplay(clip.start) ?? clip.start,
            end: display?.resultToDisplay(end, 'end') ?? end,
          },
        ];
      }),
    ],
    [incoming.instances, incoming.textClips, display, duration]
  );
  const clock = useContext(ReviewPlaybackPresentationClockContext);
  const eventInputs = {
    time: incoming.time,
    snapTimes: incoming.snapTimes,
    display,
    clock,
    beforeAction: incoming.beforeAction,
    onPlace: incoming.onPlace,
    onEnabled: incoming.onEnabled,
    onSelect: incoming.onSelect,
    onBegin: incoming.onBegin,
    onPreview: incoming.onPreview,
    onCommit: incoming.onCommit,
    onCancel: incoming.onCancel,
  };
  const receiver = useRef(eventInputs);
  useLayoutEffect(() => {
    receiver.current = eventInputs;
  });
  const commands = useMemo<AnnotationTrackCommands>(
    () => ({
      readTime: () => {
        const current = receiver.current;
        return (
          current.clock?.read() ??
          (current.display ? current.display.sourceToDisplay(current.time) : current.time)
        );
      },
      readSnapTimes: () => {
        const current = receiver.current;
        const display = current.display;
        return display
          ? current.snapTimes.map((time) => display.sourceToDisplay(time))
          : current.snapTimes;
      },
      beforeAction: (action) => (receiver.current.beforeAction ?? ((next) => next()))(action),
      onEnabled: (enabled) => receiver.current.onEnabled(enabled),
      onSelect: (id) => receiver.current.onSelect(id),
      onBegin: (id) => receiver.current.onBegin(id),
      onPreview: (range) => {
        const current = receiver.current;
        current.onPreview(
          range.result ??
            (current.display
              ? { ...anchorReviewVisualDisplay(range, current.display), timeDomain: 'result' }
              : range)
        );
      },
      onPlace: (range, anchor) => {
        const current = receiver.current;
        current.onPlace?.(
          current.display
            ? {
                start: current.display.displayToSource(range.start),
                ...(range.end === undefined
                  ? {}
                  : { end: current.display.displayToSource(range.end) }),
              }
            : range,
          anchor
        );
      },
      onCommit: () => receiver.current.onCommit(),
      onCancel: () => receiver.current.onCancel(),
    }),
    []
  );
  return (
    <AnnotationTrackPresentation
      instances={instances}
      snapshots={incoming.snapshots}
      duration={display?.duration ?? incoming.duration}
      enabled={incoming.enabled}
      busy={incoming.busy}
      drawing={incoming.drawing}
      compact={incoming.compact}
      projection={incoming.projection}
      selectedId={incoming.selectedId}
      {...commands}
    />
  );
}

type AnnotationTrackCommands = Pick<
  TrackProps,
  'onEnabled' | 'onSelect' | 'onBegin' | 'onCommit' | 'onCancel'
> & {
  onPlace: NonNullable<TrackProps['onPlace']>;
  beforeAction: NonNullable<TrackProps['beforeAction']>;
  onPreview(range: TrackRange): void;
  readTime(): number;
  readSnapTimes(): readonly number[];
};

type AnnotationTrackVisual = {
  instances: readonly TimelineClip[];
  snapshots: TrackProps['snapshots'];
  duration: number;
  enabled: boolean;
  busy: boolean;
  drawing: TrackProps['drawing'];
  compact: TrackProps['compact'];
  projection: TrackProps['projection'];
  selectedId: TrackProps['selectedId'];
};

/** Local preview/capture stays in this owner; transport and command closures are not visual inputs. */
const AnnotationTrackPresentation = memo(function AnnotationTrackPresentation(
  props: AnnotationTrackVisual & AnnotationTrackCommands
) {
  const display = props.projection?.display;
  const snapTimelineTime = useReviewTimelineSnap(
    display ? { output: display.sourceToDisplay, fromDisplay: (time) => time } : undefined
  );
  const locale = useAppLocale();
  const drag = useRef<Drag | null>(null);
  const latest = useRef(props);
  useLayoutEffect(() => {
    latest.current = props;
  });
  const [preview, setPreview] = useState<(Range & { id: string | null }) | null>(null);
  const [guide, setGuide] = useState<number | null>(null);
  const boundary = drag.current?.ready && !drag.current.ended ? drag.current : null;
  useReviewResizeBoundary(
    boundary,
    boundary &&
      (boundary.edge === 'start' || boundary.edge === 'end') &&
      props.instances.some((instance) => instance.id === boundary.id)
      ? boundary.after[boundary.edge]
      : null,
    boundary?.before,
    boundary?.after
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
  const snapshotIds = [
    ...new Set(
      props.instances.flatMap((instance) => (instance.snapshotId ? [instance.snapshotId] : []))
    ),
  ]
    .sort()
    .join(',');
  const neededSnapshots = useMemo(() => new Set(snapshotIds.split(',')), [snapshotIds]);
  const labels = useMemo(
    () =>
      new Map(
        props.snapshots
          .filter((snapshot) => neededSnapshots.has(snapshot.id))
          .map((snapshot) => {
            const document = readReviewAnnotationEffectDocument(snapshot.source, snapshot.sha256);
            return [
              snapshot.id,
              document?.label[locale] ??
                document?.label.en ??
                translate('gallery.videoReview.annotationEffects'),
            ];
          })
      ),
    [props.snapshots, neededSnapshots, locale]
  );
  const metrics = reviewTrackMetrics(props.compact);
  const height = metrics.step;
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
        } else if (current.moved) {
          props.onPreview(current.after);
          props.onCommit();
        } else {
          props.onCancel();
          if (current.id && current.edge === 'move') props.onSelect(current.id);
        }
      });
  };
  const latestFinish = useRef(finish);
  useLayoutEffect(() => {
    latestFinish.current = finish;
  });
  useEffect(() => {
    if (!props.drawing && drag.current?.edge === 'draw') latestFinish.current(true);
  }, [props.drawing]);
  return (
    <ReviewTrackRow
      track="annotationEffects"
      muted={!props.enabled}
      label={translate('gallery.videoReview.annotationEffects')}
      icon={Sticker}
      controls={
        <ReviewTrackVisibilityButton
          track={'annotationEffects'}
          label={translate('gallery.videoReview.annotationEffectsEnabled')}
          enabled={props.enabled}
          disabled={props.busy}
          className={`${reviewTrackStatusButtonClassName} !h-7 !min-h-7 !w-7 !px-1`}
          onToggle={() => props.onEnabled(!props.enabled)}
          icon={props.enabled ? Eye : EyeOff}
        />
      }
    >
      <div
        data-ui="gallery.videoReview.annotationEffectsLane"
        data-review-snap-domain="display"
        tabIndex={props.drawing && !props.busy ? 0 : undefined}
        aria-label={
          props.drawing ? translate('gallery.videoReview.annotationEffectsDraw') : undefined
        }
        className={[
          'relative rounded bg-[var(--sniptale-color-surface-hover)]',
          props.drawing
            ? [
                'cursor-inherit touch-none focus-visible:outline focus-visible:outline-2',
                'focus-visible:outline-[var(--sniptale-color-accent)]',
              ].join(' ')
            : '',
        ].join(' ')}
        style={{ height: Math.max(1, ...Array.from(rows.values(), (row) => row + 1)) * height }}
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
          const start = Math.max(0, Math.min(props.readTime(), props.duration - 0.001));
          (props.beforeAction ?? ((action) => action()))(() => props.onPlace?.({ start }, node));
        }}
        onPointerDown={(event) => {
          if (!props.drawing || props.busy || event.button !== 0 || drag.current) return;
          event.preventDefault();
          event.stopPropagation();
          const bounds = event.currentTarget.getBoundingClientRect();
          const width = Math.max(1, bounds.width);
          const candidates = event.altKey
            ? []
            : [
                0,
                props.duration,
                props.readTime(),
                ...props.readSnapTimes(),
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
                props.readTime(),
                ...props.readSnapTimes(),
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
          const name = instance.snapshotId
            ? (labels.get(instance.snapshotId) ??
              translate('gallery.videoReview.annotationEffects'))
            : instance.text?.trim() || translate('gallery.videoReview.annotationText');
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
              data-review-removal-key={`annotation:${instance.id}`}
              data-review-snap-start={instance.start}
              data-review-snap-end={instance.end}
              data-annotation-effect-row={rows.get(instance.id)}
              data-enabled={instance.enabled}
              title={`${name} ${interval}`}
              data-review-hint={reviewTimelineHint(
                name,
                range.start,
                range.end,
                instance.enabled ? undefined : translate('gallery.videoReview.itemDisabled')
              )}
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
                top: (rows.get(instance.id) ?? 0) * height + metrics.inset,
                height: metrics.body,
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
                  const edge = event.shiftKey ? 'end' : 'move';
                  const target =
                    (edge === 'end' ? instance.end : instance.start) +
                    (event.key === 'ArrowLeft' ? -1 : 1) *
                      (event.ctrlKey || event.metaKey ? 1 : 0.1);
                  props.onPreview(
                    proposeAnnotationRange(instance, edge, target, props.duration, props.projection)
                  );
                  props.onCommit();
                });
              }}
              onPointerDown={(event) => {
                event.stopPropagation();
                if (props.busy || event.button !== 0) return;
                const pending = drag.current;
                if (pending && (!pending.ended || !pending.before.result)) return;
                pending?.admission?.cancel();
                const edge =
                  event.target instanceof Element
                    ? event.target
                        .closest('[data-annotation-effect-edge]')
                        ?.getAttribute('data-annotation-effect-edge')
                    : null;
                const current: Drag = {
                  id: instance.id,
                  before: {
                    start: instance.start,
                    end: instance.end,
                    ...(instance.result ? { result: instance.result } : {}),
                  },
                  after: {
                    start: instance.start,
                    end: instance.end,
                    ...(instance.result ? { result: instance.result } : {}),
                  },
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
                  current.ready = props.onBegin(instance.id);
                  if (current.ready) {
                    props.onPreview(current.after);
                    if (!current.ended) setPreview({ id: instance.id, ...current.after });
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
                current.moved ||= Math.abs(event.clientX - current.x) > 3;
                if (!current.moved) return;
                const boundary = current.edge === 'end' ? 'end' : 'start';
                const target =
                  current.before[boundary] +
                  ((event.clientX - current.x) / current.width) * props.duration;
                let next = proposeAnnotationRange(
                  current.before,
                  current.edge,
                  target,
                  props.duration,
                  props.projection
                );
                const candidates = event.altKey
                  ? []
                  : [
                      0,
                      props.duration,
                      props.readTime(),
                      ...props.readSnapTimes(),
                      ...props.instances
                        .filter((item) => item.id !== instance.id)
                        .flatMap((item) => [item.start, item.end]),
                    ];
                const threshold = event.altKey
                  ? 0
                  : (SNAP_THRESHOLD_PX / current.width) * props.duration;
                const start = snapTimelineTime(next.start, candidates, threshold);
                const visibleResultEnd = props.projection?.resultDuration ?? props.duration;
                const clippedTail =
                  current.edge === 'move' && next.result && next.result.end > visibleResultEnd;
                const end = clippedTail
                  ? { time: next.end, candidate: null }
                  : snapTimelineTime(next.end, candidates, threshold);
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
                const anchor = snap === start ? 'start' : 'end';
                let guide = snap.candidate;
                if (guide !== null) {
                  const snapped = proposeAnnotationRange(
                    current.before,
                    current.edge,
                    snap.time,
                    props.duration,
                    props.projection,
                    anchor
                  );
                  if (!current.before.result || Math.abs(snapped[anchor] - snap.time) <= 0.000001)
                    next = snapped;
                  else guide = null;
                }
                current.after = next;
                setPreview({ id: instance.id, ...next });
                setGuide(current.edge === 'move' ? guide : null);
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
              ></div>
              <div
                data-annotation-effect-edge="end"
                aria-hidden
                className={`${reviewTimelineResizeHandleClassName} right-0`}
              ></div>
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
      </div>
    </ReviewTrackRow>
  );
});
