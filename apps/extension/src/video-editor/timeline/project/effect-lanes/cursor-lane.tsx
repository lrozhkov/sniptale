import { useContext } from 'react';
import { TIMELINE_CURSOR_ROW_HEIGHT } from './history-layout';
import { projectTimelineInterval, type TimelineProjection } from '../interaction-state/projection';
import { buildVideoCompositionCursorSegments } from '../../../../features/video/composition/timeline/lanes';
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

const CURSOR_VISIBLE_SEGMENT_CLASS_NAME = [
  'border-[color:var(--sniptale-color-border-soft)]',
  'bg-[color:var(--sniptale-color-surface-input)]',
].join(' ');

const CURSOR_HIDDEN_SEGMENT_CLASS_NAME = [
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

type CursorSegment = ReturnType<typeof buildVideoCompositionCursorSegments>[number];
type CursorSegmentMetaMap = ReturnType<typeof buildCursorSegmentMeta>;

export function ProjectTimelineCursorLane(props: {
  embedded?: boolean;
  pixelsPerSecond: number;
  projection?: TimelineProjection | undefined;
  project: VideoProject;
  selectedEffectSelection: TimelineEffectSelection | null;
  onBeginEffectInteraction: (event: React.PointerEvent, target: TimelineEffectDragTarget) => void;
}) {
  const draft = useContext(TimelineEffectDraftContext);
  const displayProject = resolveCursorDisplayProject(props.project, draft?.cursorSampleTimes);
  const segments = buildVideoCompositionCursorSegments(displayProject);
  const cursorMetaById = buildCursorSegmentMeta(displayProject, segments);

  const content = (
    <>
      {segments.length === 0 ? <ProjectTimelineEffectLaneEmptyLabel /> : null}
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
    </>
  );
  return props.embedded ? (
    <div
      className="relative border-t border-[var(--sniptale-color-border-subtle)]"
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
  return (
    <ProjectTimelineEffectSegment
      height={18}
      segmentId={props.segment.id}
      className={
        props.segment.visible ? CURSOR_VISIBLE_SEGMENT_CLASS_NAME : CURSOR_HIDDEN_SEGMENT_CLASS_NAME
      }
      isSelected={isSelectedEffectSegment(
        props.selectedEffectSelection,
        'cursor',
        props.segment.id
      )}
      label={translate('videoEditor.timeline.cursorLane')}
      hideLabel
      leadingIcon={<span className="[&_svg]:h-3 [&_svg]:w-3">{getCursorLaneIcon()}</span>}
      startTime={props.segment.start}
      endTime={props.segment.end}
      pixelsPerSecond={props.pixelsPerSecond}
      projection={props.projection}
      minimumWidth={14}
      onBeginEffectInteraction={(event) => {
        handleCursorSegmentInteraction(event, props);
      }}
      subtitle={`${formatTime(props.segment.start)} - ${formatTime(props.segment.end)}`}
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
