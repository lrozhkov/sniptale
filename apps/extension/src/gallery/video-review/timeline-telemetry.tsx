import { useReviewDragEscape } from './timeline-drag';
import { useReviewTimelineSnap } from './timeline-magnets';
import { reviewTimelineResizeHandleClassName } from './controls';
import type { CursorFocusTimelineKey } from '../../features/video/project/cursor-focus-path/timeline';
import { ReviewTimelineLabel } from './timeline-label';
import { reviewTimelineItemTone } from './controls';
import { useEffect, useMemo, useState, useId, useRef, useLayoutEffect, useCallback } from 'react';
import { ProductSelect } from '@sniptale/ui/product-form-controls';
import {
  Activity,
  MousePointerClick,
  Command,
  Keyboard,
  Mouse,
  Pause,
  MessageSquare,
  Clock,
} from 'lucide-react';
import { useAppLocale, translate } from '../../platform/i18n';
import { formatPreciseTime } from '../../composition/library-preview/time-format';
import type { ReviewTelemetryMarker } from '../../features/video/review/telemetry';
import type { RecordingTelemetryCapabilities } from '../../features/video/project/types';
import { reviewHistoryCaptureStatus } from './action-history-coverage';
import {
  layoutReviewActionLanes,
  reviewActionLane,
} from '../../features/video/review/action-lanes';
import { reviewEventLabel, reviewMouseButtonLabel, reviewTimeLabel } from './controls';

const ACTION_MARKER_HEIGHT_PX = 24;
const ACTION_LANE_GAP_PX = 4;
const ACTION_LANE_PITCH_PX = ACTION_MARKER_HEIGHT_PX + ACTION_LANE_GAP_PX;
const HISTORY_EVENT_BACKGROUND = 'var(--review-interaction-item-background)';

/** Cursor interactions forwarded unchanged from the review timeline to its telemetry strip. */
export type ReviewCursorTimelineInteractions = {
  cursorFocusKeys?: readonly CursorFocusTimelineKey[];
  selectedCursorFocusId?: string;
  onCursorFocusKey?(key: CursorFocusTimelineKey): void;
  onNavigateCursorFocus?(time: number, key?: CursorFocusTimelineKey): void;
  onMoveCursorFocus?(key: CursorFocusTimelineKey, time: number): void;
  onAddCursorFocusKey?(time: number): void;
};

type TelemetryStripProps = ReviewCursorTimelineInteractions & {
  family?: 'keyboard' | 'mouse' | undefined;
  interactionEditor?: import('./interaction-editor').ReviewInteractionEditor | undefined;
  cursorArchiveAvailable?: boolean | undefined;
  sourceId?: string | undefined;
  captureCapabilities?: RecordingTelemetryCapabilities | null | undefined;
  animatedIds?: ReadonlySet<string>;
  markers: readonly ReviewTelemetryMarker[];
  duration: number;
  time: number;
  playing?: boolean | undefined;
  width: number;
  zoom: number;
  selectedTelemetryRef?: ReviewTelemetryMarker['ref'] | undefined;

  onMarker(marker: ReviewTelemetryMarker): void;
};

/** Populated semantic rows stay stable while groups repack after zoom settles. */
export function ReviewTelemetryStrip(props: TelemetryStripProps) {
  const coverageId = useId();
  const locale = useAppLocale();
  const markerCommand = useRef(props.onMarker);
  useLayoutEffect(() => {
    markerCommand.current = props.onMarker;
  }, [props.onMarker]);
  const onMarker = useCallback(
    (marker: ReviewTelemetryMarker) => markerCommand.current(marker),
    []
  );
  const editorCommand = useRef(props.interactionEditor);
  useLayoutEffect(() => {
    editorCommand.current = props.interactionEditor;
  }, [props.interactionEditor]);
  const update = useCallback<NonNullable<TelemetryStripProps['interactionEditor']>['update']>(
    (...args) => editorCommand.current?.update(...args),
    []
  );
  const editable = !!props.interactionEditor;
  const [settled, setSettled] = useState({ width: props.width, zoom: props.zoom });
  useEffect(() => {
    const timer = setTimeout(() => setSettled({ width: props.width, zoom: props.zoom }), 250);
    return () => clearTimeout(timer);
  }, [props.width, props.zoom]);
  const layout = useMemo(
    () =>
      layoutReviewActionLanes(props.markers, {
        duration: props.duration,
        width: Math.max(1, settled.width),
        zoom: settled.zoom,
      }),
    [props.markers, props.duration, settled]
  );
  const ratio =
    (Math.max(1, props.width) * props.zoom) / (Math.max(1, settled.width) * settled.zoom);
  const retainedLanes = useRef<{ sourceId: string | undefined; lanes: number[] } | null>(null);
  const lanes = useMemo(
    () =>
      (props.family ? [props.family === 'keyboard' ? 0 : 1] : [0, 1]).filter(
        (lane) =>
          !!props.family ||
          layout.items.some((item) => item.lane === lane) ||
          (lane === 2 && (!!props.cursorFocusKeys?.length || props.cursorArchiveAvailable)) ||
          (props.cursorArchiveAvailable &&
            retainedLanes.current?.sourceId === props.sourceId &&
            retainedLanes.current?.lanes.includes(lane))
      ),
    [
      layout,
      props.family,
      props.cursorFocusKeys?.length,
      props.cursorArchiveAvailable,
      props.sourceId,
    ]
  );
  useLayoutEffect(() => {
    // Retain only committed row presence, never markers from an expired archive window.
    retainedLanes.current = props.cursorArchiveAvailable
      ? { sourceId: props.sourceId, lanes }
      : null;
  }, [props.cursorArchiveAvailable, props.sourceId, lanes]);
  const height = Math.max(1, lanes.length) * ACTION_LANE_PITCH_PX;
  const eventRows = useMemo(
    () =>
      lanes.map((lane, row) => (
        <div
          key={lane}
          role="group"
          className="contents"
          data-history-family={['keyboard', 'mouse', 'cursor'][lane]}
          data-history-coverage={reviewHistoryCaptureStatus(
            props.captureCapabilities,
            lane === 0 ? 'keyboard' : lane === 1 ? 'mouse' : 'cursor'
          )}
          title={
            lane === 0
              ? translate('gallery.videoReview.historyKeyboardCoverage', locale)
              : undefined
          }
          aria-describedby={lane === 0 ? coverageId : undefined}
          aria-label={translate(
            lane === 0
              ? 'gallery.videoReview.historyKeyboard'
              : lane === 1
                ? 'gallery.videoReview.historyMouse'
                : 'gallery.videoReview.historyCursor',
            locale
          )}
        >
          {lane === 0 ? (
            <span id={coverageId} className="sr-only">
              {translate('gallery.videoReview.historyKeyboardCoverage', locale)}
            </span>
          ) : null}
          <span
            aria-hidden="true"
            className={['pointer-events-none absolute inset-x-0', ''].join(' ')}
            style={{ top: row * ACTION_LANE_PITCH_PX + 2, height: ACTION_MARKER_HEIGHT_PX }}
          />
          {layout.items
            .filter((item) => item.lane === lane)
            .map((item) => {
              return (
                <ReviewHistoryItem
                  key={`${item.marker.ref.kind}:${item.marker.ref.id}`}
                  item={item}
                  props={{
                    selectedTelemetryRef: props.selectedTelemetryRef,
                    animatedIds: props.animatedIds,
                    onMarker,
                    editable,
                    update,
                    duration: props.duration,
                  }}
                  ratio={ratio}
                  top={row * ACTION_LANE_PITCH_PX + 2}
                />
              );
            })}
        </div>
      )),
    [
      lanes,
      layout,
      ratio,
      coverageId,
      editable,
      update,
      props.duration,
      props.captureCapabilities,
      props.selectedTelemetryRef,
      props.animatedIds,
      onMarker,
      locale,
    ]
  );
  return (
    <div
      data-ui="gallery.videoReview.historyStrip"
      className="relative overflow-hidden"
      style={{ height }}
    >
      {eventRows}
    </div>
  );
}

/** Event-specific shapes remain identifiable in narrow point markers. */
function ReviewEventIcon({ kind }: { kind: string }) {
  const Icon =
    kind === 'DOUBLE_CLICK' || kind === 'CLICK'
      ? MousePointerClick
      : kind === 'KEY' || kind === 'KEY_HOLD' || kind === 'KEY_MODIFIERS'
        ? Command
        : kind === 'typing'
          ? Keyboard
          : [
                'SCROLL',
                'WHEEL',
                'HOLD',
                'DRAG',
                'SELECTION',
                'NATIVE_DRAG',
                'PRESS_UNRESOLVED',
              ].includes(kind)
            ? Mouse
            : kind === 'PAUSE'
              ? Pause
              : kind === 'CALLOUT'
                ? MessageSquare
                : kind === 'cursor-idle'
                  ? Clock
                  : Activity;
  return <Icon size={12} className="shrink-0" aria-hidden="true" />;
}

/** Every grouped event remains selectable through the shared keyboard-accessible menu. */
function ReviewHistoryCluster(props: {
  members: ReviewTelemetryMarker[];
  left: number;
  width: number;
  top: number;
  height: number;
  selectedRef: ReviewTelemetryMarker['ref'] | undefined;
  animatedIds: ReadonlySet<string> | undefined;
  onMarker(marker: ReviewTelemetryMarker): void;
}) {
  const key = (marker: ReviewTelemetryMarker) => `${marker.ref.kind}:${marker.ref.id}`;
  const selected = props.members.some(
    (marker) =>
      props.selectedRef?.kind === marker.ref.kind && props.selectedRef.id === marker.ref.id
  );
  const animated = props.members.some(
    (marker) => marker.ref.kind === 'action' && props.animatedIds?.has(marker.ref.id)
  );
  return (
    <div
      data-review-snap-priority="none"
      className={`absolute ${props.members.every((marker) => marker.eventType === 'typing') ? 'z-0' : 'z-10'}`}
      title={
        reviewActionLane(props.members[0]!) === 0
          ? translate('gallery.videoReview.historyKeyboardCoverage')
          : undefined
      }
      style={{ left: props.left, width: props.width, top: props.top }}
    >
      <ProductSelect
        menuClassName="sniptale-parameter-menu"
        dataUi="gallery.videoReview.historyCluster"
        value=""
        placeholder={props.members.length > 99 ? '99+' : String(props.members.length)}
        aria-label={`${translate('gallery.videoReview.telemetry')} · ${props.members.length}`}
        aria-pressed={selected}
        data-animated={animated ? 'true' : 'false'}
        containerClassName="!max-w-none"
        controlSize="sm"
        menuWidth={360}
        style={{
          minHeight: props.height,
          height: props.height,
          padding: '0 12px 0 3px',
          borderRadius: 2,
          fontSize: 11,
          background: HISTORY_EVENT_BACKGROUND,
          borderColor: selected
            ? 'var(--sniptale-color-accent)'
            : 'var(--sniptale-color-border-soft)',
        }}
        className={[
          reviewTimelineItemTone(selected),
          'review-interaction-item',
          '[&_.sniptale-select-placeholder]:!text-current [&_.sniptale-select-placeholder]:font-medium',
          '!text-[var(--sniptale-color-text-secondary)]',
          '[&_.sniptale-select-chevron]:!h-2 [&_.sniptale-select-chevron]:!w-2 [&_.sniptale-select-chevron]:!right-1',
        ].join(' ')}
        onChange={(id) => {
          const marker = props.members.find((item) => key(item) === id);
          if (marker) props.onMarker(marker);
        }}
        options={props.members.map((marker) => ({
          value: key(marker),
          label: [
            marker.start === marker.end
              ? formatPreciseTime(marker.start)
              : `${reviewTimeLabel(marker.start)}–${reviewTimeLabel(marker.end)}`,
            reviewEventLabel(marker.eventType),
            reviewMouseButtonLabel(marker.mouseButton),
            marker.target,
            marker.ref.kind === 'action' && props.animatedIds?.has(marker.ref.id)
              ? translate('gallery.videoReview.clickAnimation')
              : undefined,
          ]
            .filter(Boolean)
            .join(' · '),
          icon: <ReviewEventIcon kind={marker.eventType} />,
        }))}
      />
    </div>
  );
}

const CURSOR_MOVEMENT_BACKGROUND =
  'linear-gradient(var(--sniptale-color-border-soft),var(--sniptale-color-border-soft)) center/100% 2px no-repeat';

function ReviewHistoryItem({
  item,
  props,
  ratio,
  top,
}: {
  item: ReturnType<typeof layoutReviewActionLanes>['items'][number];
  props: {
    selectedTelemetryRef: TelemetryStripProps['selectedTelemetryRef'];
    animatedIds: TelemetryStripProps['animatedIds'];
    onMarker: TelemetryStripProps['onMarker'];
    editable: boolean;
    update: NonNullable<TelemetryStripProps['interactionEditor']>['update'];
    duration: number;
  };
  ratio: number;
  top: number;
}) {
  const marker = item.marker;
  const [draft, setDraft] = useState<{ start: number; end: number }>();
  const skipClick = useRef(false);
  const drag = useRef<{
    node: HTMLButtonElement;
    pointerId: number;
    x: number;
    width: number;
    edge: 'start' | 'end' | 'move';
    after?: { start: number; end: number };
  } | null>(null);
  useReviewDragEscape(drag, () => setDraft(undefined));
  const snap = useReviewTimelineSnap();
  const down = (event: import('react').PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || !props.editable || item.members.length > 1) return;
    event.stopPropagation();
    skipClick.current = false;
    props.onMarker(marker);
    const edge =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>('[data-press-edge]')?.dataset['pressEdge']
        : undefined;
    drag.current = {
      node: event.currentTarget,
      pointerId: event.pointerId,
      x: event.clientX,
      width: event.currentTarget
        .closest('[data-ui="gallery.videoReview.historyStrip"]')!
        .getBoundingClientRect().width,
      edge: edge === 'start' || edge === 'end' ? edge : 'move',
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const range = draft ?? marker;

  const selected =
    props.selectedTelemetryRef !== undefined &&
    marker.ref.kind === props.selectedTelemetryRef.kind &&
    marker.ref.id === props.selectedTelemetryRef.id;
  const animated = marker.ref.kind === 'action' && props.animatedIds?.has(marker.ref.id);
  const tone = reviewTimelineItemTone(selected);
  const cursorLine = item.lane === 2;
  if (item.members.length > 1)
    return (
      <ReviewHistoryCluster
        key={`${marker.ref.kind}:${marker.ref.id}`}
        members={item.members}
        left={item.left * ratio}
        width={item.width * ratio}
        top={top}
        height={ACTION_MARKER_HEIGHT_PX}
        onMarker={props.onMarker}
        selectedRef={props.selectedTelemetryRef}
        animatedIds={props.animatedIds}
      />
    );
  const description = [
    reviewEventLabel(marker.eventType),
    reviewMouseButtonLabel(marker.mouseButton),
    item.lane === 0 ? translate('gallery.videoReview.historyKeyboardCoverage') : undefined,
    marker.target,
    animated ? translate('gallery.videoReview.clickAnimation') : undefined,
    `${reviewTimeLabel(marker.start)}–${reviewTimeLabel(marker.end)}`,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <button
      key={`${marker.ref.kind}:${marker.ref.id}`}
      type="button"
      onPointerDown={down}
      onPointerMove={(event) => {
        const d = drag.current;
        if (!d) return;
        event.stopPropagation();
        const delta = ((event.clientX - d.x) / d.width) * props.duration;
        const length = Math.max(0.05, marker.end - marker.start);
        let start =
          d.edge === 'end'
            ? marker.start
            : Math.max(
                0,
                Math.min(props.duration - (d.edge === 'move' ? length : 0.05), marker.start + delta)
              );
        let end =
          d.edge === 'start'
            ? marker.end
            : d.edge === 'move'
              ? start + length
              : Math.max(start + 0.05, Math.min(props.duration, marker.end + delta));
        if (!event.altKey) {
          const v = snap(d.edge === 'end' ? end : start, [], (8 / d.width) * props.duration, {
            start: 0,
            end: props.duration,
          }).time;
          if (d.edge === 'move') {
            end += v - start;
            start = v;
          } else if (d.edge === 'end') end = v;
          else start = v;
        }
        if (end < start + 0.05 || start < 0 || end > props.duration) return;
        if (Math.abs(event.clientX - d.x) > 2) {
          skipClick.current = true;
          d.after = { start, end };
          setDraft(d.after);
          d.node.dataset['reviewDragging'] = 'true';
        }
      }}
      onPointerUp={(event) => {
        const d = drag.current;
        drag.current = null;
        delete event.currentTarget.dataset['reviewDragging'];
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId);
        if (d?.after) props.update(marker, d.after.start, d.after.end);
        setDraft(undefined);
      }}
      onLostPointerCapture={() => {
        drag.current = null;
        setDraft(undefined);
      }}
      onPointerCancel={(event) => {
        drag.current = null;
        delete event.currentTarget.dataset['reviewDragging'];
        setDraft(undefined);
      }}
      data-review-action-key={`telemetry:${marker.ref.kind}:${marker.ref.id}`}
      data-review-snap-priority={cursorLine ? 'none' : 'history'}
      data-review-snap-start={marker.start}
      data-review-snap-end={marker.end}
      aria-pressed={selected}
      data-animated={animated ? 'true' : 'false'}
      aria-label={`${translate('gallery.videoReview.telemetry')} · ${description}`}
      title={description}
      onClick={() => {
        if (skipClick.current) {
          skipClick.current = false;
          return;
        }
        props.onMarker(marker);
      }}
      className={[
        'review-timeline-item review-interaction-item absolute flex touch-none select-none',
        'items-center justify-center gap-1 overflow-hidden',
        selected ? 'review-timeline-item-selected' : '',
        item.lane === 2 ? 'min-w-0' : 'min-w-1.5',
        marker.eventType === 'typing' ? 'z-0' : 'z-10',
        marker.eventType === 'typing' ? 'px-1 [&_[data-ui]]:justify-start' : '',
        'rounded-sm border text-[10px] transition-colors',
        tone,
        cursorLine ? '!border-transparent' : '',
        '!text-[var(--sniptale-color-text-secondary)]',
      ].join(' ')}
      style={{
        left:
          item.left * ratio +
          ((range.start - marker.start) / props.duration) * (drag.current?.width ?? 1),
        width: draft
          ? Math.max(6, ((range.end - range.start) / props.duration) * (drag.current?.width ?? 1))
          : item.width * ratio,
        top,
        height: ACTION_MARKER_HEIGHT_PX,
        background: cursorLine
          ? marker.eventType === 'cursor-gap'
            ? 'transparent'
            : CURSOR_MOVEMENT_BACKGROUND
          : HISTORY_EVENT_BACKGROUND,
        opacity: cursorLine && marker.eventType === 'cursor-gap' ? 0.4 : 1,
      }}
    >
      {props.editable ? (
        <>
          <span data-press-edge="start" className={`${reviewTimelineResizeHandleClassName} left-0`}>
            <span className="h-2.5 w-px bg-current" />
          </span>
          <span data-press-edge="end" className={`${reviewTimelineResizeHandleClassName} right-0`}>
            <span className="h-2.5 w-px bg-current" />
          </span>
        </>
      ) : null}
      {item.lane !== 2 ? (
        <ReviewTimelineLabel
          icon={<ReviewEventIcon kind={marker.eventType} />}
          name={reviewEventLabel(marker.eventType)}
          value={item.lane === 0 && marker.ref.kind === 'action' ? marker.target : undefined}
        />
      ) : null}
    </button>
  );
}
