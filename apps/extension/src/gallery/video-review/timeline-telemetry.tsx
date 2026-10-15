import { CursorFocusTimelineKeys } from '../../ui/cursor-focus-timeline-keys';
import type { CursorFocusTimelineKey } from '../../features/video/project/cursor-focus-path/timeline';
import { ReviewTimelineLabel } from './timeline-label';
import { reviewTimelineItemTone } from './controls';
import { useEffect, useMemo, useState, useId } from 'react';
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
import { translate } from '../../platform/i18n';
import { formatPreciseTime } from '../../composition/library-preview/time-format';
import type { ReviewTelemetryMarker } from '../../features/video/review/telemetry';
import type { RecordingTelemetryCapabilities } from '../../features/video/project/types';
import { reviewHistoryCaptureStatus } from './action-history-coverage';
import {
  layoutReviewActionLanes,
  reviewActionLane,
} from '../../features/video/review/action-lanes';
import { reviewEventLabel, reviewMouseButtonLabel, reviewTimeLabel } from './controls';

const ACTION_MARKER_HEIGHT_PX = 20;
const ACTION_LANE_GAP_PX = 4;
const ACTION_LANE_PITCH_PX = ACTION_MARKER_HEIGHT_PX + ACTION_LANE_GAP_PX;
const HISTORY_EVENT_BACKGROUND = [
  'linear-gradient(var(--sniptale-color-surface-hover),var(--sniptale-color-surface-hover))',
  'var(--sniptale-color-surface-canvas)',
].join(',');

type TelemetryStripProps = {
  captureCapabilities?: RecordingTelemetryCapabilities | null | undefined;
  animatedIds?: ReadonlySet<string>;
  markers: readonly ReviewTelemetryMarker[];
  duration: number;
  time: number;
  playing?: boolean | undefined;
  width: number;
  zoom: number;
  selectedTelemetryRef?: ReviewTelemetryMarker['ref'];
  cursorFocusKeys?: readonly CursorFocusTimelineKey[];
  selectedCursorFocusId?: string;
  onCursorFocusKey?(key: CursorFocusTimelineKey): void;
  onNavigateCursorFocus?(time: number, key?: CursorFocusTimelineKey): void;
  onMoveCursorFocus?(key: CursorFocusTimelineKey, time: number): void;
  onAddCursorFocusKey?(time: number): void;
  onMarker(marker: ReviewTelemetryMarker): void;
};

/** Populated semantic rows stay stable while groups repack after zoom settles. */
export function ReviewTelemetryStrip(props: TelemetryStripProps) {
  const coverageId = useId();
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
  const lanes = [0, 1, 2].filter(
    (lane) =>
      layout.items.some((item) => item.lane === lane) ||
      (lane === 2 && !!props.cursorFocusKeys?.length)
  );
  const cursorRow = lanes.indexOf(2);
  const cursorTop = Math.max(0, cursorRow) * ACTION_LANE_PITCH_PX;
  const height = Math.max(1, lanes.length) * ACTION_LANE_PITCH_PX - ACTION_LANE_GAP_PX;
  return (
    <div
      data-ui="gallery.videoReview.historyStrip"
      className="relative overflow-hidden"
      style={{ height }}
      onDoubleClick={(event) => {
        if (cursorRow < 0 && lanes.length > 0 && event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if ((cursorRow >= 0 && event.clientY - rect.top < cursorTop) || !props.onAddCursorFocusKey)
          return;
        event.preventDefault();
        event.stopPropagation();
        props.onAddCursorFocusKey(
          Math.max(
            0,
            Math.min(
              props.duration,
              ((event.clientX - rect.left) * props.duration) / Math.max(1, props.width * props.zoom)
            )
          )
        );
      }}
    >
      {cursorRow >= 0 || lanes.length === 0 ? (
        <ReviewCursorKeyRow props={props} top={cursorTop} />
      ) : null}
      {lanes.map((lane, row) => (
        <div
          key={lane}
          role="group"
          className="contents"
          data-history-family={['keyboard', 'mouse', 'cursor'][lane]}
          data-history-coverage={reviewHistoryCaptureStatus(
            props.captureCapabilities,
            lane === 0 ? 'keyboard' : lane === 1 ? 'mouse' : 'cursor'
          )}
          title={lane === 0 ? translate('gallery.videoReview.historyKeyboardCoverage') : undefined}
          aria-describedby={lane === 0 ? coverageId : undefined}
          aria-label={translate(
            lane === 0
              ? 'gallery.videoReview.historyKeyboard'
              : lane === 1
                ? 'gallery.videoReview.historyMouse'
                : 'gallery.videoReview.historyCursor'
          )}
        >
          {lane === 0 ? (
            <span id={coverageId} className="sr-only">
              {translate('gallery.videoReview.historyKeyboardCoverage')}
            </span>
          ) : null}
          <span
            aria-hidden="true"
            className={['pointer-events-none absolute inset-x-0', ''].join(' ')}
            style={{ top: row * ACTION_LANE_PITCH_PX, height: ACTION_MARKER_HEIGHT_PX }}
          />
          {layout.items
            .filter((item) => item.lane === lane)
            .map((item) => {
              return (
                <ReviewHistoryItem
                  key={`${item.marker.ref.kind}:${item.marker.ref.id}`}
                  item={item}
                  props={props}
                  ratio={ratio}
                  top={row * ACTION_LANE_PITCH_PX}
                />
              );
            })}
        </div>
      ))}
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
      className={`absolute ${props.members.every((marker) => marker.eventType === 'typing') ? 'z-0' : 'z-10'}`}
      title={
        reviewActionLane(props.members[0]!) === 0
          ? translate('gallery.videoReview.historyKeyboardCoverage')
          : undefined
      }
      style={{ left: props.left, width: props.width, top: props.top }}
    >
      <ProductSelect
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
          background: props.members.every((marker) => marker.eventType === 'typing')
            ? 'var(--sniptale-color-surface-hover)'
            : HISTORY_EVENT_BACKGROUND,
          borderColor: selected
            ? 'var(--sniptale-color-accent)'
            : 'var(--sniptale-color-border-soft)',
        }}
        className={[
          reviewTimelineItemTone(selected),
          '[&_.sniptale-select-placeholder]:!text-current [&_.sniptale-select-placeholder]:font-medium',
          '!text-[var(--sniptale-color-text-secondary)]',
          '[&_.sniptale-select-chevron]:!h-2 [&_.sniptale-select-chevron]:!w-2 [&_.sniptale-select-chevron]:!right-1',
          animated ? '!bg-[color-mix(in_srgb,var(--sniptale-color-info)_15%,transparent)]' : '',
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

function ReviewCursorKeyRow({ props, top }: { props: TelemetryStripProps; top: number }) {
  return props.onCursorFocusKey && props.onAddCursorFocusKey ? (
    <CursorFocusTimelineKeys
      top={top}
      height={20}
      keys={props.cursorFocusKeys ?? []}
      {...(props.selectedCursorFocusId ? { selectedId: props.selectedCursorFocusId } : {})}
      time={props.time}
      duration={props.duration}
      pixelsPerSecond={Math.max(1, props.width * props.zoom) / Math.max(0.000001, props.duration)}
      onSelect={props.onCursorFocusKey}
      playing={props.playing}
      {...(props.onNavigateCursorFocus ? { onNavigate: props.onNavigateCursorFocus } : {})}
      {...(props.onMoveCursorFocus ? { onMove: props.onMoveCursorFocus } : {})}
      onAdd={props.onAddCursorFocusKey}
    />
  ) : null;
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
  props: TelemetryStripProps;
  ratio: number;
  top: number;
}) {
  const marker = item.marker;
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
      aria-pressed={selected}
      data-animated={animated ? 'true' : 'false'}
      aria-label={`${translate('gallery.videoReview.telemetry')} · ${description}`}
      title={description}
      onClick={() => props.onMarker(marker)}
      className={[
        'absolute flex items-center justify-center gap-1 overflow-hidden',
        item.lane === 2 ? 'min-w-0' : 'min-w-1.5',
        marker.eventType === 'typing' ? 'z-0' : 'z-10',
        marker.eventType === 'typing' ? 'px-1 [&_[data-ui]]:justify-start' : '',
        'rounded-sm border text-[10px] transition-colors',
        tone,
        cursorLine ? '!border-transparent' : '',
        '!text-[var(--sniptale-color-text-secondary)]',
        animated ? '!bg-[color-mix(in_srgb,var(--sniptale-color-info)_15%,transparent)]' : '',
      ].join(' ')}
      style={{
        left: item.left * ratio,
        width: item.width * ratio,
        top,
        height: ACTION_MARKER_HEIGHT_PX,
        background: cursorLine
          ? marker.eventType === 'cursor-gap'
            ? 'transparent'
            : CURSOR_MOVEMENT_BACKGROUND
          : marker.eventType === 'typing'
            ? undefined
            : HISTORY_EVENT_BACKGROUND,
        opacity: cursorLine && marker.eventType === 'cursor-gap' ? 0.4 : 1,
      }}
    >
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
