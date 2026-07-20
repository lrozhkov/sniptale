import { buildVideoCompositionCursorSegments } from '../../../../features/video/composition/timeline/lanes';
import { translate } from '../../../../platform/i18n';
import type { VideoProject } from '../../../../features/video/project/types';
import { buildCursorSegmentMeta } from './meta';
import { formatTime } from '../interaction-state/helpers';
import { isSelectedEffectSegment, ProjectTimelineEffectSegment } from './segment';
import { ProjectTimelineEffectLaneEmptyLabel, ProjectTimelineEffectLaneRow } from './ui';
import type { TimelineEffectDragTarget, TimelineEffectSelection } from '../types';

const CURSOR_VISIBLE_SEGMENT_CLASS_NAME = [
  'border-[color:color-mix(in_srgb,var(--sniptale-color-success)_28%,var(--sniptale-color-border-soft)_72%)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-success-soft)_88%,transparent)]',
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
  pixelsPerSecond: number;
  project: VideoProject;
  selectedEffectSelection: TimelineEffectSelection | null;
  onBeginEffectInteraction: (event: React.PointerEvent, target: TimelineEffectDragTarget) => void;
}) {
  const segments = buildVideoCompositionCursorSegments(props.project);
  const cursorMetaById = buildCursorSegmentMeta(props.project, segments);

  return (
    <ProjectTimelineEffectLaneRow>
      {segments.length === 0 ? <ProjectTimelineEffectLaneEmptyLabel /> : null}
      {segments.map((segment) => (
        <ProjectTimelineCursorSegment
          key={segment.id}
          cursorMetaById={cursorMetaById}
          onBeginEffectInteraction={props.onBeginEffectInteraction}
          pixelsPerSecond={props.pixelsPerSecond}
          segment={segment}
          selectedEffectSelection={props.selectedEffectSelection}
        />
      ))}
    </ProjectTimelineEffectLaneRow>
  );
}

function ProjectTimelineCursorSegment(props: {
  cursorMetaById: CursorSegmentMetaMap;
  onBeginEffectInteraction: (event: React.PointerEvent, target: TimelineEffectDragTarget) => void;
  pixelsPerSecond: number;
  segment: CursorSegment;
  selectedEffectSelection: TimelineEffectSelection | null;
}) {
  return (
    <ProjectTimelineEffectSegment
      className={
        props.segment.visible ? CURSOR_VISIBLE_SEGMENT_CLASS_NAME : CURSOR_HIDDEN_SEGMENT_CLASS_NAME
      }
      isSelected={isSelectedEffectSegment(
        props.selectedEffectSelection,
        'cursor',
        props.segment.id
      )}
      label={translate('videoEditor.timeline.cursorLane')}
      left={props.segment.start * props.pixelsPerSecond}
      onBeginEffectInteraction={(event) => {
        handleCursorSegmentInteraction(event, props);
      }}
      subtitle={`${formatTime(props.segment.start)} - ${formatTime(props.segment.end)}`}
      width={Math.max(14, (props.segment.end - props.segment.start) * props.pixelsPerSecond)}
    />
  );
}

function handleCursorSegmentInteraction(
  event: React.PointerEvent,
  props: {
    cursorMetaById: CursorSegmentMetaMap;
    onBeginEffectInteraction: (event: React.PointerEvent, target: TimelineEffectDragTarget) => void;
    pixelsPerSecond: number;
    segment: CursorSegment;
  }
): void {
  const cursorTarget = resolveCursorInteractionTarget({
    clientX: event.clientX,
    interactionTargets: props.cursorMetaById.get(props.segment.id)?.interactionTargets ?? [],
    pixelsPerSecond: props.pixelsPerSecond,
    segmentEnd: props.segment.end,
    segmentLeft: event.currentTarget.getBoundingClientRect().left,
    segmentStart: props.segment.start,
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
