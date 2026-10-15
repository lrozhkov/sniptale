import type { clusterHistoryIntervals } from './history-clusters';
import type { TimelineEffectDragTarget } from '../types';
import { TimelineEffectDraftContext } from './segment';
import {
  getTimelineHistoryLayout,
  historyTimeBounds,
  historyMarkerTime,
  observedKeyboardInterval,
  isIncompleteObservedPress,
  buildHistoryTargetGroups,
} from './history-layout';
import { getActionEventLabel } from '../../../chrome/display';

import type { VideoEditorTypingSpanTarget } from '../../../contracts/commands/timeline';
import { projectTimelineInterval, type TimelineProjection } from '../interaction-state/projection';
import {
  Clock,
  Keyboard,
  Mouse,
  MousePointerClick,
  TextCursorInput,
  Eye,
  EyeOff,
  Lock,
  Unlock,
} from 'lucide-react';
import { ProductSelect } from '@sniptale/ui/product-form-controls';
import {
  getVideoProjectActionPresentation,
  resolveVideoProjectActionPresentations,
  type ResolvedVideoProjectActionPresentation,
} from '../../../../features/video/project/action-presentation';
import { getVideoProjectUtilityLanes } from '../../../../features/video/project/utility-lanes';
import type { VideoEditorSelection } from '../../../contracts/selection';
import { TimelineIconButton } from '../controls/icon-button';
import { formatPreciseTime } from '../../../../composition/library-preview/time-format';
import { useMemo, useContext, useId, type CSSProperties, type ReactNode } from 'react';
import type { RecordingTelemetryEntry } from '../../../../composition/persistence/recordings/contracts';
import { translate, formatNumber } from '../../../../platform/i18n';
import type {
  VideoProject,
  VideoProjectActionEvent,
} from '../../../../features/video/project/types';
import { buildTimelineTelemetryLaneData } from '../../../project/operations/telemetry-lane';
import { TIMELINE_OBJECT_MARKER_PROPS } from '../canvas/hover-preview';
import {
  getTelemetryLaneIcon,
  TimelineLaneIdentity,
  TIMELINE_LANE_HEADER_CLASS_NAME,
} from '../tracks/lane-icons';

const TELEMETRY_ROW_CLASS_NAME = [
  'relative border-b border-[var(--sniptale-color-border-subtle)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-overlay)_86%,transparent)]',
].join(' ');

const TELEMETRY_EMPTY_LABEL_CLASS_NAME = [
  'pointer-events-none absolute left-3 right-3 top-1/2 -translate-y-1/2 truncate text-xs',
  'text-[var(--sniptale-color-text-dim)]',
].join(' ');

export function ProjectTimelineTelemetryLaneLabelRow(props: {
  compactRows: boolean;
  recordingTelemetry?: readonly RecordingTelemetryEntry[] | undefined;
  height?: number;
  project?: VideoProject;
  onSelect?: (() => void) | undefined;
  selected?: boolean | undefined;
  onToggleVisibility?: (() => void) | undefined;
  onToggleLock?: (() => void) | undefined;
}) {
  const approximate = (props.recordingTelemetry ?? []).filter(
    (entry) => entry.capabilities?.timing?.mode === 'approximate'
  );
  const unknownAccuracy = approximate.some(
    (entry) => entry.capabilities?.timing?.accuracyMs == null
  );
  const accuracy = Math.ceil(
    Math.max(0, ...approximate.map((entry) => entry.capabilities?.timing?.accuracyMs ?? 0))
  );

  const enabled = props.project ? getVideoProjectActionPresentation(props.project).enabled : true;
  const locked = props.project ? getVideoProjectUtilityLanes(props.project).actions.locked : false;
  return (
    <div
      className={TIMELINE_LANE_HEADER_CLASS_NAME}
      data-selected={props.selected ?? false}
      style={{ height: props.height ?? 80 }}
    >
      <button
        type="button"
        data-ui="video-editor.timeline.history-lane"
        aria-pressed={props.selected ?? false}
        className={`flex min-w-0 flex-1 items-center gap-2 text-left text-[var(--sniptale-color-text-primary)]
`}
        aria-label={translate('videoEditor.timeline.telemetryLane')}
        onClick={props.onSelect}
      >
        <TimelineLaneIdentity
          selected={props.selected ?? false}
          icon={getTelemetryLaneIcon()}
          prefix="H1"
          name={translate('videoEditor.timeline.historyLaneShort')}
        />
      </button>
      <div className="flex shrink-0 items-center gap-1">
        {approximate.length ? (
          <span
            role="status"
            data-ui="history.timing"
            title={
              unknownAccuracy
                ? translate('gallery.videoReview.historyTimingUnknown')
                : translate('gallery.videoReview.historyTimingApproximate').replace(
                    '{accuracy}',
                    String(accuracy)
                  )
            }
            aria-label={
              unknownAccuracy
                ? translate('gallery.videoReview.historyTimingUnknown')
                : translate('gallery.videoReview.historyTimingApproximate').replace(
                    '{accuracy}',
                    String(accuracy)
                  )
            }
            className="inline-flex items-center text-[var(--sniptale-color-text-secondary)]"
          >
            <Clock size={13} aria-hidden="true" />
          </span>
        ) : null}
        {props.onToggleVisibility ? (
          <TimelineIconButton
            frameless
            active={!enabled}
            disabled={locked}
            dataUi="timeline.utility-lane-state"
            icon={enabled ? <Eye size={13} /> : <EyeOff size={13} />}
            title={translate(
              enabled
                ? 'videoEditor.timeline.historyEnabled'
                : 'videoEditor.timeline.historyDisabled'
            )}
            onClick={props.onToggleVisibility}
            stopPropagation
          />
        ) : null}
        {props.onToggleLock ? (
          <TimelineIconButton
            frameless
            active={locked}
            dataUi="timeline.utility-lane-state"
            icon={locked ? <Lock size={13} /> : <Unlock size={13} />}
            title={translate(
              locked ? 'videoEditor.timeline.laneLocked' : 'videoEditor.timeline.laneEditable'
            )}
            onClick={props.onToggleLock}
            stopPropagation
          />
        ) : null}
      </div>
    </div>
  );
}

function historyStatus(item: ResolvedVideoProjectActionPresentation) {
  return translate(
    item.enabled
      ? 'videoEditor.timeline.historyEnabled'
      : item.reason === 'suppressed'
        ? 'videoEditor.timeline.historySuppressed'
        : 'videoEditor.timeline.historyDisabled'
  );
}

function historyLabel(item: ResolvedVideoProjectActionPresentation) {
  const button = item.event.data['button'];
  const buttonLabels = [
    'videoEditor.timeline.historyButtonLeft',
    'videoEditor.timeline.historyButtonMiddle',
    'videoEditor.timeline.historyButtonRight',
    'videoEditor.timeline.historyButtonBack',
    'videoEditor.timeline.historyButtonForward',
  ] as const;
  return [
    observedEventLabel(item.event),
    item.event.kind === 'CLICK' &&
    typeof button === 'number' &&
    Number.isInteger(button) &&
    button >= 0 &&
    button <= 31
      ? button <= 4
        ? translate(buttonLabels[button]!)
        : translate('videoEditor.timeline.historyButtonOther').replace(
            '{number}',
            formatNumber(button + 1)
          )
      : '',
    formatPreciseTime(item.animationStart),
    item.offset !== 0
      ? `${translate('videoEditor.timeline.historyOriginalTime')}: ${formatPreciseTime(item.occurrence.time)}`
      : '',
    historyStatus(item),
    item.event.kind === 'KEY' ? translate('videoEditor.timeline.historyKeyboardCoverage') : '',
    item.overridden ? translate('videoEditor.timeline.historyOverride') : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

function observedEventLabel(event: VideoProjectActionEvent) {
  const keyboard = observedKeyboardInterval(event);
  if (keyboard) {
    const key =
      event.data['modifierOnly'] === true
        ? 'videoEditor.timeline.historyKeyModifiers'
        : keyboard.end - keyboard.start >= 0.5 ||
            (typeof event.data['repeatCount'] === 'number' && event.data['repeatCount'] > 0)
          ? 'videoEditor.timeline.historyKeyHold'
          : null;
    if (key) return [translate(key), event.label].filter(Boolean).join(' · ');
  }
  if (isIncompleteObservedPress(event))
    return [translate('videoEditor.timeline.historyIncompletePress'), event.label]
      .filter(Boolean)
      .join(' · ');
  const labels = {
    hold: 'videoEditor.timeline.historyHold',
    drag: 'videoEditor.timeline.historyDrag',
    selection: 'videoEditor.timeline.historySelection',
    'native-drag': 'videoEditor.timeline.historyNativeDrag',
  } as const;
  const gesture = event.data['gestureType'];
  const key =
    typeof gesture === 'string' && Object.hasOwn(labels, gesture)
      ? labels[gesture as keyof typeof labels]
      : event.kind === 'SCROLL' && event.data['eventType'] === 'wheel'
        ? 'videoEditor.timeline.historyWheel'
        : null;
  return key
    ? [translate(key), event.label].filter(Boolean).join(' · ')
    : getActionEventLabel(event);
}

function HistoryMarker(props: {
  movable: boolean;
  item: ResolvedVideoProjectActionPresentation;
  left: number;
  width?: number | undefined;
  top: number;
  selected: boolean;
  onSelect: () => void;
  onBegin: (
    event: React.PointerEvent<HTMLButtonElement>,
    item: ResolvedVideoProjectActionPresentation
  ) => void;
}) {
  const { item } = props;
  const Icon =
    item.event.kind === 'KEY'
      ? Keyboard
      : item.event.kind === 'SCROLL' ||
          isIncompleteObservedPress(item.event) ||
          (typeof item.event.data['gestureType'] === 'string' &&
            ['hold', 'drag', 'selection', 'native-drag'].includes(item.event.data['gestureType']))
        ? Mouse
        : MousePointerClick;
  return (
    <button
      type="button"
      {...TIMELINE_OBJECT_MARKER_PROPS}
      data-ui="video-editor.timeline.history-event"
      data-action-id={item.event.id}
      data-action-clip-id={item.occurrence.clipId ?? 'project'}
      data-history-status={item.enabled ? 'enabled' : item.reason}
      data-history-override={item.overridden}
      title={historyLabel(item)}
      aria-label={historyLabel(item)}
      aria-pressed={props.selected}
      className={[
        'video-editor-timeline-item',
        props.movable ? '!cursor-grab' : '!cursor-pointer',
        'absolute z-10 flex h-6 w-6 -translate-x-1/2 items-center justify-center gap-1',
        'overflow-hidden rounded-sm border px-1 text-[10px]',
        'bg-[var(--sniptale-color-surface-panel)] text-[var(--sniptale-color-text-secondary)]',
        props.selected
          ? 'video-editor-timeline-item-selected border-[var(--sniptale-color-border-soft)]'
          : 'border-[var(--sniptale-color-border-soft)]',
        item.reason === 'suppressed' ? 'border-dashed' : '',
        !item.enabled ? '!text-[var(--sniptale-color-text-dim)]' : '',
      ].join(' ')}
      style={{
        left: props.left,
        top: props.top,
        ...(props.width ? { width: props.width, transform: 'translateX(-12px)' } : {}),
      }}
      onPointerDown={(event) => {
        event.stopPropagation();
        props.onBegin(event, item);
      }}
      onClick={(event) => {
        event.stopPropagation();
        props.onSelect();
      }}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {(props.width ?? 24) >= 56 ? (
        <span className="min-w-0 truncate">
          {item.event.kind === 'KEY' && item.event.label
            ? item.event.label
            : observedEventLabel(item.event)}
        </span>
      ) : null}
      {!item.enabled && item.reason !== 'suppressed' ? (
        <span aria-hidden="true" className="absolute h-px w-4 -rotate-45 bg-current" />
      ) : null}
      {item.overridden ? (
        <span
          aria-hidden="true"
          className="absolute -right-1 -top-1 rounded-full bg-[var(--sniptale-color-surface-panel)] text-[10px]"
        >
          *
        </span>
      ) : null}
    </button>
  );
}

function ProjectTimelineTelemetrySpan(props: {
  top: number;
  target?: VideoEditorTypingSpanTarget | undefined;
  onSelect?: (() => void) | undefined;
  selected?: boolean;
  label?: string | undefined;
  endTime: number;
  kind: 'typing';
  pixelsPerSecond: number;
  projection?: TimelineProjection | undefined;
  startTime: number;
}) {
  const geometry = props.projection
    ? projectTimelineInterval(props.projection, props.startTime, props.endTime)
    : {
        left: props.startTime * props.pixelsPerSecond,
        width: (props.endTime - props.startTime) * props.pixelsPerSecond,
      };
  if (!geometry) return null;
  const kindLabel = translate('videoEditor.timeline.historyTyping');
  return (
    <button
      type="button"
      {...TIMELINE_OBJECT_MARKER_PROPS}
      aria-pressed={props.selected ?? false}
      disabled={!props.onSelect}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        props.onSelect?.();
      }}
      aria-label={props.label ?? `${kindLabel} · ${formatPreciseTime(props.startTime)}`}
      data-ui="video-editor.timeline.history-span"
      data-history-span-kind={props.kind}
      data-history-signal-id={props.target?.signalId}
      data-history-clip-id={props.target?.clipId}
      data-history-source-instance-id={props.target?.sourceInstanceId}
      data-history-recording-id={props.target?.recordingId}
      title={props.label ?? kindLabel}
      className={[
        'absolute z-0 flex items-center justify-center gap-1 rounded-sm border text-[10px] truncate px-1',
        props.onSelect ? 'video-editor-timeline-item !cursor-pointer' : 'cursor-default',
        props.selected ? 'video-editor-timeline-item-selected' : '',
        'border-[var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-panel)]',
      ].join(' ')}
      style={{
        top: props.top,
        height: 24,
        left: geometry.left,
        width: Math.max(16, geometry.width),
      }}
    >
      <TextCursorInput size={14} className="shrink-0" aria-hidden="true" />
      {geometry.width >= 70 ? <span className="min-w-0 truncate">{kindLabel}</span> : null}
    </button>
  );
}

interface TimelineHistoryLaneProps {
  cursorLaneVisible?: boolean;
  cursorRow?: ReactNode;
  onBeginEffectInteraction?:
    | ((event: React.PointerEvent, target: TimelineEffectDragTarget) => void)
    | undefined;
  onSelectHistorySpan?: ((target: VideoEditorTypingSpanTarget) => void) | undefined;
  onSeek: (time: number) => void;
  onSelectActionOccurrence?: ((eventId: string, clipId: string | null) => void) | undefined;
  selection?: VideoEditorSelection | undefined;
  pixelsPerSecond: number;
  projection?: TimelineProjection | undefined;
  project: VideoProject;
  recordingTelemetry: readonly RecordingTelemetryEntry[];
}
export function ProjectTimelineTelemetryLane(props: TimelineHistoryLaneProps) {
  const coverageId = useId();
  const draft = useContext(TimelineEffectDraftContext);
  const layout = getTimelineHistoryLayout(
    props.project,
    props.recordingTelemetry,
    props.cursorLaneVisible
  );
  const spans = useMemo(
    () =>
      props.recordingTelemetry.flatMap((telemetry) =>
        buildTimelineTelemetryLaneData(props.project, telemetry.recordingId, telemetry)
          .spans.filter((span) => span.kind === 'typing')
          .map((span) => ({
            ...span,
            id: JSON.stringify([telemetry.recordingId, span.id]),
          }))
      ),
    [props.project, props.recordingTelemetry]
  );
  const items = resolveVideoProjectActionPresentations(props.project);
  const byId = new Map(
    items.map((item) => [JSON.stringify([item.occurrence.eventId, item.occurrence.clipId]), item])
  );
  const spansById = new Map(spans.map((span) => [span.id, span]));
  const { actionLeft, actionWidths, groups } = buildHistoryTargetGroups({
    items,
    spans,
    project: props.project,
    projection: props.projection,
    pixelsPerSecond: props.pixelsPerSecond,
    draft,
    layout,
  });
  const selectTyping = (id: string) => {
    const span = spansById.get(id);
    if (!span?.signalId) return;
    props.onSelectHistorySpan?.({
      recordingId: span.recordingId,
      sourceInstanceId: span.sourceInstanceId,
      signalId: span.signalId,
      clipId: span.clipId,
    });
  };
  const typingSelected = (span: (typeof spans)[number]) =>
    props.selection?.kind === 'history-span' &&
    props.selection.clipId === span.clipId &&
    props.selection.recordingId === span.recordingId &&
    props.selection.sourceInstanceId === span.sourceInstanceId &&
    props.selection.signalId === span.signalId;
  const select = (id: string) => {
    const item = byId.get(id);
    if (!item) {
      selectTyping(id);
      return;
    }
    props.onSelectActionOccurrence?.(item.occurrence.eventId, item.occurrence.clipId);
  };
  const selectedId =
    props.selection?.kind === 'action-occurrence'
      ? JSON.stringify([props.selection.eventId, props.selection.clipId])
      : null;
  return (
    <div
      data-ui="video-editor.timeline.history-row"
      data-timeline-lane-muted={!getVideoProjectActionPresentation(props.project).enabled}
      className={TELEMETRY_ROW_CLASS_NAME}
      style={{ height: layout.height }}
    >
      {(['keyboard', 'mouse', 'cursor'] as const).map((family, index) => (
        <div
          key={family}
          data-history-family={family}
          title={
            family === 'keyboard'
              ? translate('videoEditor.timeline.historyKeyboardCoverage')
              : undefined
          }
          aria-describedby={family === 'keyboard' ? coverageId : undefined}
          role="group"
          aria-label={translate(
            family === 'keyboard'
              ? 'videoEditor.timeline.historyKeyboard'
              : family === 'mouse'
                ? 'videoEditor.timeline.historyMouse'
                : 'videoEditor.timeline.cursorLane'
          )}
          className="pointer-events-none absolute inset-x-0"
          style={{ top: index * 28, height: 24 }}
        >
          {family === 'keyboard' ? (
            <span id={coverageId} className="sr-only">
              {translate('videoEditor.timeline.historyKeyboardCoverage')}
            </span>
          ) : null}
        </div>
      ))}
      {!items.length && !spans.length ? (
        <span className={TELEMETRY_EMPTY_LABEL_CLASS_NAME}>
          {translate('videoEditor.timeline.telemetryLaneEmpty')}
        </span>
      ) : null}
      {layout.cursorTop !== null ? (
        <div className="absolute inset-x-0" style={{ top: layout.cursorTop }}>
          {props.cursorRow}
        </div>
      ) : null}
      <ActionHistoryMarkers
        movable={
          !getVideoProjectUtilityLanes(props.project).actions.locked &&
          Boolean(props.onBeginEffectInteraction)
        }
        groups={groups}
        spansById={spansById}
        typingSelected={typingSelected}
        spanLabel={(span) => typingSpanLabel(props.project, span, props.recordingTelemetry)}
        spanProps={props}
        actionLeft={actionLeft}
        actionWidths={actionWidths}
        byId={byId}
        selectedId={selectedId}
        select={select}
        begin={(event, item) => {
          props.onSelectActionOccurrence?.(item.occurrence.eventId, item.occurrence.clipId);
          if (getVideoProjectUtilityLanes(props.project).actions.locked) return;
          const { minimumTime, maximumTime } = historyTimeBounds(item, props.project);
          props.onBeginEffectInteraction?.(event, {
            kind: 'action',
            eventId: item.occurrence.eventId,
            clipId: item.occurrence.clipId,
            segmentId: JSON.stringify([item.occurrence.eventId, item.occurrence.clipId]),
            originalStart: historyMarkerTime(item, props.project),
            minimumTime,
            maximumTime,
          });
        }}
      />
    </div>
  );
}

function ActionHistoryMarkers({
  movable,
  groups,
  spansById,
  typingSelected,
  spanLabel,
  spanProps,
  actionLeft,
  actionWidths,
  byId,
  selectedId,
  select,
  begin,
}: {
  movable: boolean;
  begin: (
    event: React.PointerEvent<HTMLButtonElement>,
    item: ResolvedVideoProjectActionPresentation
  ) => void;
  groups: (ReturnType<typeof clusterHistoryIntervals>[number] & { top: number })[];
  spansById: Map<string, ReturnType<typeof buildTimelineTelemetryLaneData>['spans'][number]>;
  typingSelected: (
    span: ReturnType<typeof buildTimelineTelemetryLaneData>['spans'][number]
  ) => boolean;
  spanLabel: (span: ReturnType<typeof buildTimelineTelemetryLaneData>['spans'][number]) => string;
  spanProps: TimelineHistoryLaneProps;
  actionLeft: Map<string, number>;
  actionWidths: Map<string, number>;
  byId: Map<string, ReturnType<typeof resolveVideoProjectActionPresentations>[number]>;
  selectedId: string | null;
  select: (id: string) => void;
}) {
  return (
    <>
      {groups.map((group) =>
        group.ids.length === 1 && byId.has(group.ids[0]!) ? (
          <HistoryMarker
            movable={movable}
            key={group.ids[0]}
            item={byId.get(group.ids[0]!)!}
            left={actionLeft.get(group.ids[0]!) ?? group.left}
            width={actionWidths.get(group.ids[0]!)}
            top={group.top}
            selected={selectedId === group.ids[0]}
            onSelect={() => select(group.ids[0]!)}
            onBegin={begin}
          />
        ) : group.ids.length === 1 ? (
          <ProjectTimelineTelemetrySpan
            key={group.ids[0]}
            top={group.top}
            target={spansById.get(group.ids[0]!)!}
            selected={typingSelected(spansById.get(group.ids[0]!)!)}
            label={spanLabel(spansById.get(group.ids[0]!)!)}
            endTime={spansById.get(group.ids[0]!)!.endTime}
            startTime={spansById.get(group.ids[0]!)!.startTime}
            kind="typing"
            pixelsPerSecond={spanProps.pixelsPerSecond}
            projection={spanProps.projection}
            onSelect={spanProps.onSelectHistorySpan ? () => select(group.ids[0]!) : undefined}
          />
        ) : (
          <div
            key={JSON.stringify(group.ids)}
            className={`absolute -translate-x-1/2 ${group.ids.every((id) => spansById.has(id)) ? 'z-0' : 'z-10'}`}
            style={{
              left: group.left,
              top: group.top,
              ...(group.ids.every((id) => spansById.has(id))
                ? { transform: 'translateX(-20px)' }
                : {}),
            }}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <ProductSelect
              dataUi={
                group.ids.every((id) => spansById.has(id))
                  ? 'video-editor.timeline.history-span-cluster'
                  : 'video-editor.timeline.history-cluster'
              }
              value=""
              placeholder={group.ids.length > 99 ? '99+' : String(group.ids.length)}
              aria-pressed={
                Boolean(selectedId && group.ids.includes(selectedId)) ||
                group.ids.some((id) => {
                  const span = spansById.get(id);
                  return span ? typingSelected(span) : false;
                })
              }
              aria-label={`${translate('videoEditor.timeline.telemetryLane')} · ${group.ids.length}`}
              style={historyClusterStyle(
                group.ids.every((id) => spansById.has(id)) ? Math.max(40, group.width) : 40
              )}
              className={[
                'video-editor-timeline-item',
                selectedId && group.ids.includes(selectedId)
                  ? 'video-editor-timeline-item-selected'
                  : '',
                '[&_.sniptale-select-chevron]:h-2.5! [&_.sniptale-select-chevron]:w-2.5!',
                '[&_.sniptale-select-chevron]:right-1! [&_.sniptale-select-placeholder]:text-current!',
              ].join(' ')}
              controlSize="sm"
              menuWidth={360}
              menuClassName={[
                'max-h-80!',
                '[&_[role=option]:has([data-history-muted])]:!text-[var(--sniptale-color-text-dim)]',
                '[&_[role=option]:has([data-history-muted])]:!bg-[var(--sniptale-color-surface-input)]',
              ].join(' ')}
              menuScrollable
              onChange={select}
              options={group.ids.map((id) => {
                const item = byId.get(id);
                const span = spansById.get(id);
                if (span)
                  return {
                    value: id,
                    label: spanLabel(span),
                    icon: <TextCursorInput size={14} aria-hidden="true" />,
                  };
                if (!item) throw new Error('History group references an unknown fact.');
                return {
                  value: id,
                  label: historyLabel(item),
                  ...(!item.enabled
                    ? { icon: <EyeOff size={14} aria-hidden="true" data-history-muted /> }
                    : {}),
                };
              })}
            />
          </div>
        )
      )}
    </>
  );
}

function historyClusterStyle(width = 40): CSSProperties & Record<`--${string}`, string> {
  return {
    width,
    minWidth: 40,
    height: 24,
    minHeight: 24,
    padding: '0 14px 0 4px',
    gap: 2,
    justifyContent: 'center',
    '--sniptale-field-radius': 'var(--sniptale-radius-sm)',
    '--sniptale-field-font-size': '11px',
    '--sniptale-field-bg-idle': 'var(--sniptale-color-surface-panel)',
    '--sniptale-field-bg-hover': 'var(--sniptale-color-surface-panel)',
    '--sniptale-field-border-idle': 'var(--sniptale-color-border-soft)',
    '--sniptale-field-shadow-idle': 'none',
  };
}

function typingSpanLabel(
  project: VideoProject,
  span: ReturnType<typeof buildTimelineTelemetryLaneData>['spans'][number],
  telemetry: readonly RecordingTelemetryEntry[]
) {
  const signal = telemetry
    .find((entry) => entry.recordingId === span.recordingId)
    ?.signals.find((signal) => signal.id === span.signalId);
  const targetName = signal?.data['targetName'];
  const clip = project.clips.find((item) => item.id === span.clipId);
  const track = project.tracks.find((item) => item.id === clip?.trackId);
  return [
    translate(
      signal?.data['keyboardHold'] === true
        ? 'videoEditor.timeline.historyKeyHold'
        : 'videoEditor.timeline.historyTyping'
    ),
    translate('videoEditor.timeline.historyKeyboardCoverage'),
    typeof targetName === 'string' ? targetName : '',
    track?.name,
    clip?.name,
    `${formatPreciseTime(span.startTime)}–${formatPreciseTime(span.endTime)}`,
  ]
    .filter(Boolean)
    .join(' · ');
}
