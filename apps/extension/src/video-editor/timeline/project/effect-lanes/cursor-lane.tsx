import { ProjectCursorFocusKeys } from './cursor-focus-keys';
import type { RecordingTelemetryEntry } from '../../../../composition/persistence/recordings/contracts';
import { buildTimelineTelemetryLaneData } from '../../../project/operations/telemetry-lane';
import { useContext, useMemo } from 'react';
import { TIMELINE_CURSOR_ROW_HEIGHT } from './history-layout';
import { projectTimelineInterval, type TimelineProjection } from '../interaction-state/projection';
import { buildHistoryCursorRuns } from '../../../../features/video/review/cursor-history';
import { translate } from '../../../../platform/i18n';
import type { VideoProject } from '../../../../features/video/project/types';
import { buildCursorSegmentMeta } from './meta';
import { formatTime } from '../interaction-state/helpers';
import { getCursorLaneIcon } from '../tracks/lane-icons';
import {
  isSelectedEffectSegment,
  ProjectTimelineEffectSegment,
  TimelineEffectDraftContext,
} from './segment';
import { ProjectTimelineEffectLaneEmptyLabel, ProjectTimelineEffectLaneRow } from './ui';
import type {
  TimelineEffectDragTarget,
  TimelineEffectSelection,
  TimelineEffectDragDraft,
} from '../types';

const CURSOR_LINE_BACKGROUND_CLASS_NAME =
  '![background-image:linear-gradient(var(--sniptale-color-border-soft),var(--sniptale-color-border-soft))]';

const CURSOR_VISIBLE_SEGMENT_CLASS_NAME = [
  'pointer-events-auto !rounded-sm',
  'border-[color:var(--sniptale-color-border-soft)]',
  'bg-[color:var(--sniptale-color-surface-input)]',
].join(' ');

const CURSOR_HIDDEN_SEGMENT_CLASS_NAME = [
  'pointer-events-auto !rounded-sm',
  'border-[color:var(--sniptale-color-border-soft)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-input)_86%,transparent)]',
  'opacity-60',
].join(' ');

interface CursorInteractionTarget {
  end: number;
  nextBoundary: number;
  nextSampleId: string | null;
  previousBoundary: number;
  sampleId: string;
  start: number;
}

type CursorSegment = ReturnType<typeof buildHistoryCursorRuns>[number];
type CursorSegmentMetaMap = ReturnType<typeof buildCursorSegmentMeta>;

export function ProjectTimelineCursorLane(props: {
  embedded?: boolean;
  recordingTelemetry?: readonly RecordingTelemetryEntry[];
  pixelsPerSecond: number;
  projection?: TimelineProjection | undefined;
  project: VideoProject;
  selectedEffectSelection: TimelineEffectSelection | null;
  onBeginEffectInteraction: (event: React.PointerEvent, target: TimelineEffectDragTarget) => void;
}) {
  const draft = useContext(TimelineEffectDraftContext);
  const displayProject = useMemo(
    () => resolveCursorDisplayProject(props.project, draft?.cursorSampleTimes),
    [props.project, draft?.cursorSampleTimes]
  );
  const { segments, cursorMetaById } = useMemo(() => {
    const dwellRanges = (props.recordingTelemetry ?? []).flatMap((entry) =>
      buildTimelineTelemetryLaneData(displayProject, entry.recordingId, entry).spans.filter(
        (span) => span.kind === 'cursor-idle'
      )
    );
    const segments = buildHistoryCursorRuns(
      displayProject.cursorTrack,
      displayProject.duration,
      dwellRanges
    );
    return { segments, cursorMetaById: buildCursorSegmentMeta(displayProject, segments) };
  }, [displayProject, props.recordingTelemetry]);

  const unavailable =
    (props.recordingTelemetry?.length ?? 0) > 0 &&
    props.recordingTelemetry!.every((entry) => entry.capabilities?.pointer === 'unavailable');
  const known =
    (props.recordingTelemetry?.length ?? 0) > 0 &&
    props.recordingTelemetry!.every((entry) => entry.capabilities?.pointer === 'available');
  const emptyLabel = translate(
    unavailable
      ? 'videoEditor.timeline.historyCursorUnavailable'
      : known
        ? 'videoEditor.timeline.historyCursorEmpty'
        : 'videoEditor.timeline.historyCursorUnknown'
  );
  const content = (
    <>
      {segments.length === 0 ? <ProjectTimelineEffectLaneEmptyLabel label={emptyLabel} /> : null}
      <ProjectCursorFocusKeys
        project={props.project}
        pixelsPerSecond={props.pixelsPerSecond}
        {...(props.projection ? { projection: props.projection } : {})}
      >
        <div className="pointer-events-none absolute inset-0 z-10">
          {segments.map((segment) => (
            <ProjectTimelineCursorSegment
              key={segment.id}
              cursorMetaById={cursorMetaById}
              onBeginEffectInteraction={props.onBeginEffectInteraction}
              pixelsPerSecond={props.pixelsPerSecond}
              projection={props.projection}
              segment={segment}
              selectedEffectSelection={props.selectedEffectSelection}
            />
          ))}
        </div>
      </ProjectCursorFocusKeys>
    </>
  );
  return props.embedded ? (
    <div
      className="relative"
      style={{ height: TIMELINE_CURSOR_ROW_HEIGHT }}
      data-ui="video-editor.timeline.history-cursor-row"
    >
      {content}
    </div>
  ) : (
    <ProjectTimelineEffectLaneRow>{content}</ProjectTimelineEffectLaneRow>
  );
}

function ProjectTimelineCursorSegment(props: {
  cursorMetaById: CursorSegmentMetaMap;
  onBeginEffectInteraction: (event: React.PointerEvent, target: TimelineEffectDragTarget) => void;
  pixelsPerSecond: number;
  projection?: TimelineProjection | undefined;
  segment: CursorSegment;
  selectedEffectSelection: TimelineEffectSelection | null;
}) {
  const width = props.projection
    ? (projectTimelineInterval(props.projection, props.segment.start, props.segment.end)?.width ??
      0)
    : (props.segment.end - props.segment.start) * props.pixelsPerSecond;
  const selected = isSelectedEffectSegment(
    props.selectedEffectSelection,
    'cursor',
    props.segment.id
  );
  const label = translate(
    props.segment.kind === 'cursor-gap'
      ? 'videoEditor.timeline.historyCursorGap'
      : props.segment.kind === 'cursor-idle'
        ? 'videoEditor.timeline.historyCursorDwell'
        : 'videoEditor.timeline.historyCursorMove'
  );
  const compact = (props.segment.kind !== 'cursor-idle' && !selected) || width < 100;
  return (
    <ProjectTimelineEffectSegment
      height={20}
      top={2}
      segmentId={props.segment.id}
      className={[
        props.segment.visible
          ? CURSOR_VISIBLE_SEGMENT_CLASS_NAME
          : CURSOR_HIDDEN_SEGMENT_CLASS_NAME,
        props.segment.kind === 'cursor-gap' && !selected
          ? '!border-transparent !bg-transparent'
          : props.segment.kind === 'cursor' && !selected
            ? [
                '!border-transparent !bg-transparent',
                CURSOR_LINE_BACKGROUND_CLASS_NAME,
                '![background-size:100%_2px] ![background-position:center] ![background-repeat:no-repeat]',
              ].join(' ')
            : '',
        compact ? '[&>div]:invisible !px-0' : '',
      ].join(' ')}
      isSelected={isSelectedEffectSegment(
        props.selectedEffectSelection,
        'cursor',
        props.segment.id
      )}
      label={label}
      hideLabel={false}
      leadingIcon={<span className="[&_svg]:h-3 [&_svg]:w-3">{getCursorLaneIcon()}</span>}
      startTime={props.segment.start}
      endTime={props.segment.end}
      pixelsPerSecond={props.pixelsPerSecond}
      projection={props.projection}
      minimumWidth={0}
      onBeginEffectInteraction={(event) => {
        handleCursorSegmentInteraction(event, props);
      }}
      title={`${label} · ${formatTime(props.segment.start)} - ${formatTime(props.segment.end)}`}
    />
  );
}

function handleCursorSegmentInteraction(
  event: React.PointerEvent,
  props: {
    cursorMetaById: CursorSegmentMetaMap;
    onBeginEffectInteraction: (event: React.PointerEvent, target: TimelineEffectDragTarget) => void;
    pixelsPerSecond: number;
    projection?: TimelineProjection | undefined;
    segment: CursorSegment;
  }
): void {
  const visibleOffset = props.projection
    ? (projectTimelineInterval(props.projection, props.segment.start, props.segment.end)
        ?.offsetSeconds ?? 0)
    : 0;
  const cursorTarget = resolveCursorInteractionTarget({
    clientX: event.clientX,
    interactionTargets: props.cursorMetaById.get(props.segment.id)?.interactionTargets ?? [],
    pixelsPerSecond: props.pixelsPerSecond,
    segmentEnd: props.segment.end,
    segmentLeft: event.currentTarget.getBoundingClientRect().left,
    segmentStart: props.segment.start + visibleOffset,
  });
  if (!cursorTarget) {
    return;
  }

  props.onBeginEffectInteraction(event, {
    kind: 'cursor',
    nextBoundary: cursorTarget.nextBoundary,
    nextSampleId: cursorTarget.nextSampleId,
    originalEnd: cursorTarget.end,
    originalStart: cursorTarget.start,
    previousBoundary: cursorTarget.previousBoundary,
    sampleId: cursorTarget.sampleId,
    segmentId: props.segment.id,
  });
}

function resolveCursorInteractionTarget(params: {
  clientX: number;
  interactionTargets: CursorInteractionTarget[];
  pixelsPerSecond: number;
  segmentEnd: number;
  segmentLeft: number;
  segmentStart: number;
}) {
  if (params.interactionTargets.length === 0) {
    return null;
  }

  const boundedTime = Math.min(
    params.segmentEnd,
    Math.max(
      params.segmentStart,
      params.segmentStart + (params.clientX - params.segmentLeft) / params.pixelsPerSecond
    )
  );

  return (
    params.interactionTargets.find(
      (target) => boundedTime >= target.start && boundedTime <= target.end
    ) ??
    params.interactionTargets.at(-1) ??
    null
  );
}

function resolveCursorDisplayProject(
  project: VideoProject,
  times: TimelineEffectDragDraft['cursorSampleTimes']
): VideoProject {
  if (!times || !project.cursorTrack) return project;
  const samples = project.cursorTrack.samples
    .map((sample) => {
      if (sample.id === times.sampleId) return { ...sample, time: times.startTime };
      if (sample.id === times.nextSampleId && times.endTime !== null)
        return { ...sample, time: times.endTime };
      return sample;
    })
    .sort((left, right) => left.time - right.time);
  return { ...project, cursorTrack: { ...project.cursorTrack, samples } };
}
