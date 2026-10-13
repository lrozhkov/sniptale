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
import { reviewHistoryCaptureStatus, reviewHistoryCaptureLabel } from './action-history-coverage';
import {
  layoutReviewActionLanes,
  reviewActionLane,
} from '../../features/video/review/action-lanes';
import { reviewEventLabel, reviewMouseButtonLabel, reviewTimeLabel } from './controls';

const ACTION_MARKER_HEIGHT_PX = 20;
const ACTION_LANE_GAP_PX = 4;
const ACTION_LANE_PITCH_PX = ACTION_MARKER_HEIGHT_PX + ACTION_LANE_GAP_PX;
/** Dense history never adds a fourth row. */
const ACTION_LANE_MAX_VISIBLE = 3;

type TelemetryStripProps = {
  captureCapabilities?: RecordingTelemetryCapabilities | null | undefined;
  animatedIds?: ReadonlySet<string>;
  markers: readonly ReviewTelemetryMarker[];
  duration: number;
  time: number;
  width: number;
  zoom: number;
  selectedTelemetryRef?: ReviewTelemetryMarker['ref'];
  cursorFocusKeys?: readonly CursorFocusTimelineKey[];
  selectedCursorFocusId?: string;
  onCursorFocusKey?(key: CursorFocusTimelineKey): void;
  onAddCursorFocusKey?(time: number): void;
  onMarker(marker: ReviewTelemetryMarker): void;
};

/** Stable strip height with bounded groups repacked only after zoom settles. */
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
  const height =
    ACTION_LANE_MAX_VISIBLE * ACTION_MARKER_HEIGHT_PX +
    (ACTION_LANE_MAX_VISIBLE - 1) * ACTION_LANE_GAP_PX;
  return (
    <div
      data-ui="gallery.videoReview.historyStrip"
      className="relative overflow-hidden"
      style={{ height }}
      onDoubleClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.clientY - rect.top < 48 || !props.onAddCursorFocusKey) return;
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
      <ReviewCursorKeyRow props={props} />
      {[0, 1, 2].map((lane) => (
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
            style={{ top: lane * ACTION_LANE_PITCH_PX, height: ACTION_MARKER_HEIGHT_PX }}
          />
          {!layout.items.some((item) => item.lane === lane) &&
          (lane !== 2 || !props.cursorFocusKeys?.length) ? (
            <span
              className={`pointer-events-none absolute inset-x-0 truncate px-1
                text-[11px] leading-5 text-[var(--sniptale-color-text-secondary)]`}
              style={{ top: lane * ACTION_LANE_PITCH_PX }}
            >
              {translate(
                reviewHistoryCaptureLabel(
                  reviewHistoryCaptureStatus(
                    props.captureCapabilities,
                    lane === 0 ? 'keyboard' : lane === 1 ? 'mouse' : 'cursor'
                  )
                )
              )}
            </span>
          ) : null}
          {layout.items
            .filter((item) => item.lane === lane)
            .map((item) => {
              return (
                <ReviewHistoryItem
                  key={`${item.marker.ref.kind}:${item.marker.ref.id}`}
                  item={item}
                  props={props}
                  ratio={ratio}
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
      className="absolute z-10"
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
          background: 'var(--sniptale-color-surface-hover)',
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

function ReviewCursorKeyRow({ props }: { props: TelemetryStripProps }) {
  return props.onCursorFocusKey && props.onAddCursorFocusKey ? (
    <CursorFocusTimelineKeys
      top={48}
      height={20}
      keys={props.cursorFocusKeys ?? []}
      {...(props.selectedCursorFocusId ? { selectedId: props.selectedCursorFocusId } : {})}
      time={props.time}
      duration={props.duration}
      pixelsPerSecond={Math.max(1, props.width * props.zoom) / Math.max(0.000001, props.duration)}
      onSelect={props.onCursorFocusKey}
      onAdd={props.onAddCursorFocusKey}
    />
  ) : null;
}

function ReviewHistoryItem({
  item,
  props,
  ratio,
}: {
  item: ReturnType<typeof layoutReviewActionLanes>['items'][number];
  props: TelemetryStripProps;
  ratio: number;
}) {
  const marker = item.marker;
  const selected =
    props.selectedTelemetryRef !== undefined &&
    marker.ref.kind === props.selectedTelemetryRef.kind &&
    marker.ref.id === props.selectedTelemetryRef.id;
  const animated = marker.ref.kind === 'action' && props.animatedIds?.has(marker.ref.id);
  const tone = reviewTimelineItemTone(selected);
  if (item.members.length > 1)
    return (
      <ReviewHistoryCluster
        key={`${marker.ref.kind}:${marker.ref.id}`}
        members={item.members}
        left={item.left * ratio}
        width={item.width * ratio}
        top={item.lane * ACTION_LANE_PITCH_PX}
        height={ACTION_MARKER_HEIGHT_PX}
        onMarker={props.onMarker}
        selectedRef={props.selectedTelemetryRef}
        animatedIds={props.animatedIds}
      />
    );
  return (
    <button
      key={`${marker.ref.kind}:${marker.ref.id}`}
      type="button"
      aria-pressed={selected}
      data-animated={animated ? 'true' : 'false'}
      aria-label={[
        translate('gallery.videoReview.telemetry'),
        reviewEventLabel(marker.eventType),
        reviewMouseButtonLabel(marker.mouseButton),
        item.lane === 0 ? translate('gallery.videoReview.historyKeyboardCoverage') : undefined,
        marker.target,
        animated ? translate('gallery.videoReview.clickAnimation') : undefined,
        `${reviewTimeLabel(marker.start)}–${reviewTimeLabel(marker.end)}`,
      ]
        .filter(Boolean)
        .join(' · ')}
      title={[
        reviewEventLabel(marker.eventType),
        reviewMouseButtonLabel(marker.mouseButton),
        item.lane === 0 ? translate('gallery.videoReview.historyKeyboardCoverage') : undefined,
        marker.target,
        animated ? translate('gallery.videoReview.clickAnimation') : undefined,
        `${reviewTimeLabel(marker.start)}–${reviewTimeLabel(marker.end)}`,
      ]
        .filter(Boolean)
        .join(' · ')}
      onClick={() => props.onMarker(marker)}
      className={[
        'absolute z-10 flex min-w-1.5 items-center justify-center gap-1 overflow-hidden',
        'rounded-sm border text-[10px] transition-colors',
        tone,
        '!text-[var(--sniptale-color-text-secondary)]',
        animated ? '!bg-[color-mix(in_srgb,var(--sniptale-color-info)_15%,transparent)]' : '',
      ].join(' ')}
      style={{
        left: item.left * ratio,
        width: item.width * ratio,
        top: item.lane * ACTION_LANE_PITCH_PX,
        height: ACTION_MARKER_HEIGHT_PX,
      }}
    >
      <ReviewTimelineLabel
        icon={<ReviewEventIcon kind={marker.eventType} />}
        name={reviewEventLabel(marker.eventType)}
      />
    </button>
  );
}
