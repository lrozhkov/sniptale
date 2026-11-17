import { reviewTimelineHint } from './timeline-hints';
import { useReviewTimelineSnap } from './timeline-magnets';
import { SNAP_THRESHOLD_PX } from '../../features/video/review/snap';
import {
  reviewTrackMetrics,
  ReviewTrackRow,
  ReviewTrackCuts,
  ReviewTrackVisibilityButton,
} from './track-row';
import { useReviewResizeBoundary } from './timeline-resize-guide';
import { Captions, ClosedCaption } from 'lucide-react';
import { memo, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReviewTextFragment } from '../../features/video/review/text-document';
import { packReviewTextRows } from '../../features/video/review/text-projection';
import type { useReviewText } from './use-review-text';
import { deferReviewGesture, type ReviewBeforeAction } from './note-transitions';
import { useReviewDragEscape } from './timeline-drag';
import { translate, useAppLocale } from '../../platform/i18n';
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

type TextLaneModel = Pick<TextTrackProps, 'selectedId' | 'busy' | 'compact'> &
  Pick<TextTrackProps['editor'], 'document' | 'projection' | 'sourceInterval'> & {
    captionsEnabled: boolean;
    canToggleCaptions: boolean;
  };
type TextLaneCommands = {
  change: TextTrackProps['editor']['change'];
  onSelect: TextTrackProps['onSelect'];
  beforeAction: ReviewBeforeAction;
  onToggleCaptions(): void;
};
type TextLaneProps = TextLaneModel & TextLaneCommands;

/** Publish command receivers only after commit; visual props retain their own identities. */
export function ReviewTextTrack(props: TextTrackProps) {
  const receivers = {
    change: props.editor.change,
    onSelect: props.onSelect,
    beforeAction: props.beforeAction,
    onToggleCaptions: props.onToggleCaptions,
  };
  const committed = useRef(receivers);
  useLayoutEffect(() => {
    committed.current = receivers;
  });
  const commands = useMemo<TextLaneCommands>(
    () => ({
      change: (...args) => committed.current.change(...args),
      onSelect: (id) => committed.current.onSelect(id),
      beforeAction: (action) => {
        const before = committed.current.beforeAction;
        if (before) before(action);
        else action();
      },
      onToggleCaptions: () => committed.current.onToggleCaptions?.(),
    }),
    []
  );
  return (
    <ReviewTextLane
      document={props.editor.document}
      projection={props.editor.projection}
      sourceInterval={props.editor.sourceInterval}
      captionsEnabled={props.editor.captions.enabled}
      canToggleCaptions={!!props.onToggleCaptions}
      selectedId={props.selectedId}
      busy={props.busy}
      compact={props.compact}
      {...commands}
    />
  );
}

const ReviewTextLane = memo(function ReviewTextLane(props: TextLaneProps) {
  const gesture = useReviewTextTrackGesture(props);
  const preview = gesture.preview;
  useAppLocale();
  const textLabel = translate('gallery.videoReview.speechText');
  const { sourceInterval, projection } = props;
  const latest = useRef({ props, gesture });
  useLayoutEffect(() => {
    latest.current = { props, gesture };
  });
  const fragments = useMemo(
    () =>
      preview
        ? props.document.fragments.map((fragment) =>
            preview.id === fragment.id ? preview : fragment
          )
        : props.document.fragments,
    [props.document.fragments, preview]
  );
  const ranges = useMemo(
    () =>
      fragments.map((fragment) => ({
        id: fragment.id,
        ...sourceInterval(fragment),
      })),
    [fragments, sourceInterval]
  );
  const rows = useMemo(() => packReviewTextRows(ranges), [ranges]);
  const rowCount = Math.max(1, ...Array.from(rows.values(), (row) => row + 1));
  const metrics = reviewTrackMetrics(props.compact);
  const step = metrics.step;
  const items = useMemo(
    () =>
      fragments.map((fragment) => {
        const range = sourceInterval(fragment);
        const resultClock = fragment.timeDomain === 'result' && !fragment.sourceAnchor;
        const left = resultClock
          ? projection.display.resultToDisplay(fragment.start)
          : projection.display.sourceToDisplay(range.start);
        const right = resultClock
          ? projection.display.resultToDisplay(fragment.end, 'end')
          : projection.display.sourceToDisplay(range.end, 'end');
        return (
          <div
            key={fragment.id}
            role="button"
            tabIndex={props.busy ? -1 : 0}
            aria-label={[
              fragment.text || textLabel,
              `${reviewTimeLabel(range.start)}–${reviewTimeLabel(range.end)}`,
            ].join(' · ')}
            aria-pressed={props.selectedId === fragment.id}
            aria-disabled={props.busy}
            data-review-hint={reviewTimelineHint(textLabel, range.start, range.end, fragment.text)}
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
              left: `${(left / projection.display.duration) * 100}%`,
              width: `${(Math.max(0, right - left) / projection.display.duration) * 100}%`,
            }}
            onKeyDown={(event) => {
              if (props.busy || (event.key !== 'Enter' && event.key !== ' ')) return;
              event.preventDefault();
              const current = latest.current.props;
              (current.beforeAction ?? ((action) => action()))(() => current.onSelect(fragment.id));
            }}
            onPointerDown={(event) => latest.current.gesture.start(event, fragment)}
            onPointerMove={(event) => latest.current.gesture.move(event)}
            onPointerUp={() => latest.current.gesture.finish()}
            onPointerCancel={() => latest.current.gesture.cancel()}
            onLostPointerCapture={() => latest.current.gesture.cancel()}
          >
            <span className="flex h-full items-center">
              <span
                className="block min-w-0 truncate
                  text-[color:var(--review-item-foreground,var(--sniptale-color-text-secondary))]
                  font-[number:var(--review-label-weight,400)]"
              >
                {fragment.text || textLabel}
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
      }),
    [
      fragments,
      rows,
      sourceInterval,
      projection,
      props.busy,
      props.selectedId,
      gesture.draggingId,
      metrics.body,
      metrics.inset,
      step,
      textLabel,
    ]
  );
  return (
    <ReviewTrackRow
      track="text"
      label={translate('gallery.videoReview.textTrack')}
      icon={Captions}
      controls={
        <ReviewTrackVisibilityButton
          track="text"
          label={translate('gallery.videoReview.captionsEnabled')}
          enabled={props.captionsEnabled}
          className={`${reviewTrackStatusButtonClassName} !w-7 !min-h-7 !h-7 !px-0`}
          disabled={props.busy || !props.canToggleCaptions}
          onToggle={() =>
            (props.beforeAction ?? ((action) => action()))(() => props.onToggleCaptions?.())
          }
          icon={ClosedCaption}
        />
      }
    >
      <div
        data-ui="gallery.videoReview.textTrack"
        className="relative rounded bg-[var(--sniptale-color-surface-hover)]"
        style={{ height: rowCount * step }}
      >
        {items}
        <ReviewTrackCuts projection={props.projection} />
      </div>
    </ReviewTrackRow>
  );
});

/** One pointer capture owns the disposable preview, admission, Escape and final timing commit. */
function useReviewTextTrackGesture(props: TextLaneProps) {
  const snap = useReviewTimelineSnap({
    output: props.projection.display.sourceToDisplay,
    fromDisplay: (time) => time,
  });
  const drag = useRef<{
    base: ReviewTextFragment;
    moved: boolean;
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
  const boundaryRange = preview ? props.sourceInterval(preview) : null;
  useReviewResizeBoundary(
    boundary,
    boundary &&
      boundary.edge !== 'move' &&
      boundaryRange &&
      props.document.fragments.some((fragment) => fragment.id === boundary.base.id)
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
  const duration = Math.max(0.01, props.projection.duration);
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
    const { sourceAnchor: _sourceAnchor, ...fields } = fragment;
    const base = {
      ...fields,
      timeDomain: 'result' as const,
      start:
        fragment.timeDomain === 'source' ? props.projection.output(fragment.start) : fragment.start,
      end: fragment.timeDomain === 'source' ? props.projection.output(fragment.end) : fragment.end,
    };
    drag.current = {
      base,
      moved: false,
      x: event.clientX,
      width: bounds.width,
      edge: edge === 'start' || edge === 'end' ? edge : 'move',
      node: event.currentTarget,
      pointerId: event.pointerId,
      admission: deferReviewGesture(props.beforeAction, () => props.onSelect(fragment.id), 'click'),
    };
    previewRef.current = base;
    setPreview(base);
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const move = (event: React.PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current) return;
    current.moved ||= Math.abs(event.clientX - current.x) > 3;
    if (!current.moved) return;
    const base = current.base;
    const limit = base.timeDomain === 'source' ? duration : props.projection.resultDuration;
    const display = props.projection.display;
    const edge = current.edge === 'end' ? 'end' : 'start';
    const displayed = display.resultToDisplay(base[edge], edge);
    const deltaPixels = event.clientX - current.x;
    const requested = Math.max(
      0,
      Math.min(display.duration, displayed + (deltaPixels * display.duration) / current.width)
    );
    const candidates = [
      0,
      display.duration,
      ...props.document.fragments
        .filter((fragment) => fragment.id !== base.id)
        .flatMap((fragment) => {
          if (fragment.timeDomain === 'result' && !fragment.sourceAnchor)
            return [
              display.resultToDisplay(fragment.start),
              display.resultToDisplay(fragment.end, 'end'),
            ];
          const range = props.sourceInterval(fragment);
          return [display.sourceToDisplay(range.start), display.sourceToDisplay(range.end, 'end')];
        }),
    ];
    const snapped = event.altKey
      ? requested
      : snap(requested, candidates, (SNAP_THRESHOLD_PX * display.duration) / current.width).time;
    const delta = display.displayToResult(snapped) - base[edge];
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
    if (
      current.moved &&
      next &&
      (next.start !== current.base.start || next.end !== current.base.end)
    )
      current.admission.commit(() =>
        props.change(
          current.base.id,
          { start: next.start, end: next.end, timeDomain: 'result' },
          current.base.timingRevision
        )
      );
    else if (!current.moved && current.edge === 'move') current.admission.select();
    else current.admission.cancel();
  };
  return { preview, draggingId: drag.current?.base.id, start, move, finish, cancel };
}
