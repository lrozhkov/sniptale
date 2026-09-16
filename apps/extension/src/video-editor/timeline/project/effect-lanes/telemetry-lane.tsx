import type { TimelineEffectDragTarget } from '../types';
import { TimelineEffectDraftContext } from './segment';
import { getTimelineHistoryLayout } from './history-layout';
import { getActionEventLabel } from '../../../chrome/display';

import type { VideoEditorTypingSpanTarget } from '../../../contracts/commands/timeline';
import {
  projectTimelineInterval,
  projectTimelinePoint,
  type TimelineProjection,
} from '../interaction-state/projection';
import {
  Keyboard,
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
import { clusterHistoryMarkers, clusterHistoryIntervals } from './history-clusters';
import { useMemo, useContext, type CSSProperties, type ReactNode } from 'react';
import type { RecordingTelemetryEntry } from '../../../../composition/persistence/recordings/contracts';
import { translate } from '../../../../platform/i18n';
import type { VideoProject } from '../../../../features/video/project/types';
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

function getTelemetrySpanClassName(kind: 'stable' | 'typing'): string {
  if (kind === 'typing') {
    return [
      'border-[var(--sniptale-color-border-soft)]',
      'bg-[var(--sniptale-color-surface-panel)]',
    ].join(' ');
  }

  return [
    'border-[var(--sniptale-color-border-soft)]',
    'bg-[var(--sniptale-color-surface-input)]',
  ].join(' ');
}

export function ProjectTimelineTelemetryLaneLabelRow(props: {
  compactRows: boolean;
  height?: number;
  project?: VideoProject;
  onSelect?: (() => void) | undefined;
  selected?: boolean | undefined;
  onToggleVisibility?: (() => void) | undefined;
  onToggleLock?: (() => void) | undefined;
}) {
  const enabled = props.project ? getVideoProjectActionPresentation(props.project).enabled : true;
  const locked = props.project ? getVideoProjectUtilityLanes(props.project).actions.locked : false;
  return (
    <div
      className={TIMELINE_LANE_HEADER_CLASS_NAME}
      data-selected={props.selected ?? false}
      style={{ height: props.height ?? 56 }}
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
  return [
    getActionEventLabel(item.event),
    formatPreciseTime(item.animationStart),
    item.offset !== 0
      ? `${translate('videoEditor.timeline.historyOriginalTime')}: ${formatPreciseTime(item.occurrence.time)}`
      : '',
    historyStatus(item),
    item.overridden ? translate('videoEditor.timeline.historyOverride') : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

function HistoryMarker(props: {
  movable: boolean;
  item: ResolvedVideoProjectActionPresentation;
  left: number;
  top: number;
  selected: boolean;
  onSelect: () => void;
  onBegin: (
    event: React.PointerEvent<HTMLButtonElement>,
    item: ResolvedVideoProjectActionPresentation
  ) => void;
}) {
  const { item } = props;
  const Icon = item.event.kind === 'KEY' ? Keyboard : MousePointerClick;
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
        'absolute flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-md border',
        'bg-[var(--sniptale-color-surface-panel)] text-[var(--sniptale-color-text-secondary)]',
        props.selected
          ? 'video-editor-timeline-item-selected border-[var(--sniptale-color-border-soft)]'
          : 'border-[var(--sniptale-color-border-soft)]',
        item.reason === 'suppressed' ? 'border-dashed' : '',
        !item.enabled ? 'opacity-60' : '',
      ].join(' ')}
      style={{ left: props.left, top: props.top }}
      onPointerDown={(event) => {
        event.stopPropagation();
        props.onBegin(event, item);
      }}
      onClick={(event) => {
        event.stopPropagation();
        props.onSelect();
      }}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
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
  kind: 'stable' | 'typing';
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
  const kindLabel = translate(
    props.kind === 'typing'
      ? 'videoEditor.timeline.historyTyping'
      : 'videoEditor.timeline.historyStable'
  );
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
        'absolute flex items-center justify-center rounded border text-[10px] truncate px-1',
        props.onSelect ? 'video-editor-timeline-item !cursor-pointer' : 'cursor-default',
        props.selected ? 'video-editor-timeline-item-selected' : '',
        getTelemetrySpanClassName(props.kind),
        props.kind === 'typing' ? '' : 'pointer-events-none',
      ].join(' ')}
      style={{
        top: props.top,
        height: props.kind === 'typing' ? 24 : 3,
        left: geometry.left,
        width: Math.max(16, geometry.width),
      }}
    >
      {props.kind === 'typing' ? <TextCursorInput size={14} aria-hidden="true" /> : null}
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
  const draft = useContext(TimelineEffectDraftContext);
  const layout = getTimelineHistoryLayout(
    props.project,
    props.recordingTelemetry,
    props.cursorLaneVisible
  );
  const spans = useMemo(
    () =>
      props.recordingTelemetry.flatMap((telemetry) =>
        buildTimelineTelemetryLaneData(props.project, telemetry.recordingId, telemetry).spans.map(
          (span) => ({
            ...span,
            id: JSON.stringify([telemetry.recordingId, span.id]),
          })
        )
      ),
    [props.project, props.recordingTelemetry]
  );
  const items = resolveVideoProjectActionPresentations(props.project);
  const byId = new Map(
    items.map((item) => [JSON.stringify([item.occurrence.eventId, item.occurrence.clipId]), item])
  );
  const groups = [false, true].flatMap((keys) =>
    clusterHistoryMarkers(
      items
        .filter((item) => (item.event.kind === 'KEY') === keys)
        .map((item) => {
          const id = JSON.stringify([item.occurrence.eventId, item.occurrence.clipId]);
          const time =
            draft?.segmentId === id
              ? (draft.startTime ?? historyMarkerTime(item, props.project))
              : historyMarkerTime(item, props.project);
          return {
            id,
            left: props.projection
              ? projectTimelinePoint(props.projection, time)
              : time * props.pixelsPerSecond,
          };
        }),
      props.projection?.viewportWidth
    ).map((group) => ({
      ...group,
      top: keys ? (layout.keyTop ?? layout.clickTop) : layout.clickTop,
    }))
  );
  const select = (id: string) => {
    const item = byId.get(id);
    if (!item) return;
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
      {!items.length && !spans.length ? (
        <span className={TELEMETRY_EMPTY_LABEL_CLASS_NAME}>
          {translate('videoEditor.timeline.telemetryLaneEmpty')}
        </span>
      ) : null}
      <HistoryIntervals {...props} spans={spans} layout={layout} />
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
  groups: (ReturnType<typeof clusterHistoryMarkers>[number] & { top: number })[];
  byId: Map<string, ReturnType<typeof resolveVideoProjectActionPresentations>[number]>;
  selectedId: string | null;
  select: (id: string) => void;
}) {
  return (
    <>
      {groups.map((group) =>
        group.ids.length === 1 ? (
          <HistoryMarker
            movable={movable}
            key={group.ids[0]}
            item={byId.get(group.ids[0]!)!}
            left={group.left}
            top={group.top}
            selected={selectedId === group.ids[0]}
            onSelect={() => select(group.ids[0]!)}
            onBegin={begin}
          />
        ) : (
          <div
            key={JSON.stringify(group.ids)}
            className="absolute -translate-x-1/2"
            style={{ left: group.left, top: group.top }}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <ProductSelect
              dataUi="video-editor.timeline.history-cluster"
              value=""
              placeholder={group.ids.length > 99 ? '99+' : String(group.ids.length)}
              aria-pressed={Boolean(selectedId && group.ids.includes(selectedId))}
              aria-label={`${translate('videoEditor.timeline.telemetryLane')} · ${group.ids.length}`}
              style={historyClusterStyle()}
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
                const item = byId.get(id)!;
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

function historyClusterStyle(): CSSProperties & Record<`--${string}`, string> {
  return {
    width: 40,
    minWidth: 40,
    height: 24,
    minHeight: 24,
    padding: '0 14px 0 4px',
    gap: 2,
    justifyContent: 'center',
    '--sniptale-field-radius': 'var(--sniptale-radius-lg)',
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
  const targetName = telemetry
    .find((entry) => entry.recordingId === span.recordingId)
    ?.signals.find((signal) => signal.id === span.signalId)?.data['targetName'];
  const clip = project.clips.find((item) => item.id === span.clipId);
  const track = project.tracks.find((item) => item.id === clip?.trackId);
  return [
    translate('videoEditor.timeline.historyTyping'),
    typeof targetName === 'string' ? targetName : '',
    track?.name,
    clip?.name,
    `${formatPreciseTime(span.startTime)}–${formatPreciseTime(span.endTime)}`,
  ]
    .filter(Boolean)
    .join(' · ');
}

function historyTimeBounds(item: ResolvedVideoProjectActionPresentation, project: VideoProject) {
  const ids = item.occurrence.playbackRun?.clipIds;
  const clips = ids ? project.clips.filter((clip) => ids.includes(clip.id)) : [];
  const minimumTime = clips.length ? Math.min(...clips.map((clip) => clip.startTime)) : 0;
  const end = clips.length
    ? Math.max(...clips.map((clip) => clip.startTime + clip.duration))
    : project.duration;
  return { minimumTime, maximumTime: Math.max(minimumTime, end - 1 / project.fps) };
}

function historyMarkerTime(item: ResolvedVideoProjectActionPresentation, project: VideoProject) {
  const { minimumTime, maximumTime } = historyTimeBounds(item, project);
  return Math.max(minimumTime, Math.min(maximumTime, item.animationStart));
}

function HistoryIntervals(
  props: Pick<
    TimelineHistoryLaneProps,
    | 'project'
    | 'recordingTelemetry'
    | 'pixelsPerSecond'
    | 'projection'
    | 'selection'
    | 'onSeek'
    | 'onSelectHistorySpan'
  > & {
    spans: ReturnType<typeof buildTimelineTelemetryLaneData>['spans'];
    layout: ReturnType<typeof getTimelineHistoryLayout>;
  }
) {
  const { spans, layout } = props;
  const typingSpans = spans.filter((span) => span.kind === 'typing' && span.signalId);
  const typingById = new Map(typingSpans.map((span) => [span.id, span]));
  const typingGroups = clusterHistoryIntervals(
    typingSpans.map((span) => {
      const geometry = props.projection
        ? projectTimelineInterval(props.projection, span.startTime, span.endTime)
        : {
            left: span.startTime * props.pixelsPerSecond,
            width: (span.endTime - span.startTime) * props.pixelsPerSecond,
          };
      return { id: span.id, left: geometry?.left ?? null, width: geometry?.width ?? 0 };
    }),
    props.projection?.viewportWidth
  );
  const clusteredTypingIds = new Set(
    typingGroups.filter((group) => group.ids.length > 1).flatMap((group) => group.ids)
  );
  const typingSelected = (span: (typeof spans)[number]) =>
    props.selection?.kind === 'history-span' &&
    props.selection.clipId === span.clipId &&
    props.selection.recordingId === span.recordingId &&
    props.selection.sourceInstanceId === span.sourceInstanceId &&
    props.selection.signalId === span.signalId;
  const selectTyping = (id: string) => {
    const span = typingById.get(id);
    if (!span?.signalId || !props.onSelectHistorySpan) return;
    props.onSelectHistorySpan({
      recordingId: span.recordingId,
      sourceInstanceId: span.sourceInstanceId,
      signalId: span.signalId,
      clipId: span.clipId,
    });
  };
  return (
    <>
      {spans
        .filter((span) => !clusteredTypingIds.has(span.id))
        .map((span) => (
          <ProjectTimelineTelemetrySpan
            key={span.id}
            top={span.kind === 'typing' ? (layout.typingTop ?? 32) : layout.actionHeight - 4}
            label={
              span.kind === 'typing'
                ? typingSpanLabel(props.project, span, props.recordingTelemetry)
                : undefined
            }
            target={
              span.kind === 'typing' && span.signalId
                ? {
                    recordingId: span.recordingId,
                    sourceInstanceId: span.sourceInstanceId,
                    signalId: span.signalId,
                    clipId: span.clipId,
                  }
                : undefined
            }
            selected={typingSelected(span)}
            onSelect={
              span.kind === 'typing' && span.signalId && props.onSelectHistorySpan
                ? () => selectTyping(span.id)
                : undefined
            }
            endTime={span.endTime}
            kind={span.kind}
            pixelsPerSecond={props.pixelsPerSecond}
            projection={props.projection}
            startTime={span.startTime}
          />
        ))}
      {typingGroups
        .filter((group) => group.ids.length > 1)
        .map((group) => {
          const selected = group.ids.some((id) => typingSelected(typingById.get(id)!));
          return (
            <div
              key={JSON.stringify(group.ids)}
              className="absolute h-6"
              style={{ left: group.left, width: group.width, top: layout.typingTop ?? 32 }}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
            >
              <ProductSelect
                dataUi="video-editor.timeline.history-span-cluster"
                value=""
                placeholder={group.ids.length > 99 ? '99+' : String(group.ids.length)}
                aria-label={`${translate('videoEditor.timeline.historyTyping')} · ${group.ids.length}`}
                aria-pressed={selected}
                disabled={!props.onSelectHistorySpan}
                style={{
                  ...historyClusterStyle(),
                  width: group.width,
                  minWidth: 0,
                  padding: '0 2px',
                }}
                className={[
                  'video-editor-timeline-item',
                  selected ? 'video-editor-timeline-item-selected' : '',
                  '[&_.sniptale-select-chevron]:hidden [&_.sniptale-select-placeholder]:text-current!',
                ].join(' ')}
                controlSize="sm"
                menuWidth={360}
                menuClassName="max-h-80!"
                menuScrollable
                onChange={selectTyping}
                options={group.ids.map((id) => ({
                  value: id,
                  label: typingSpanLabel(
                    props.project,
                    typingById.get(id)!,
                    props.recordingTelemetry
                  ),
                }))}
              />
            </div>
          );
        })}
    </>
  );
}
