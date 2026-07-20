import { buildVideoCompositionActionSegments } from '../../../../features/video/composition/timeline/lanes';
import { formatTime } from '../interaction-state/helpers';
import { getActionPresetLabel } from './labels';
import { buildTimelineActionSegments } from './segments';
import type { UtilityLaneProps } from './utility-lane-types';
import { isSelectedEffectSegment, ProjectTimelineEffectSegment } from './segment';
import { ProjectTimelineEffectLaneEmptyLabel, ProjectTimelineEffectLaneRow } from './ui';

const ACTIONS_LANE_SEGMENT_CLASS_NAME = [
  'border-[color:color-mix(in_srgb,var(--sniptale-color-info)_28%,var(--sniptale-color-border-soft)_72%)]',
  'bg-[linear-gradient(',
  '135deg,color-mix(in_srgb,var(--sniptale-color-info)_22%,transparent),',
  'color-mix(in_srgb,var(--sniptale-color-accent-soft)_72%,transparent))]',
].join(' ');

export function ProjectTimelineActionsLane(
  props: UtilityLaneProps & { laneVisible: boolean }
): React.JSX.Element {
  const segments = props.laneVisible
    ? buildVideoCompositionActionSegments(props.project)
    : buildTimelineActionSegments(props.project);
  return (
    <ProjectTimelineEffectLaneRow onPointerDown={rangeSelectionHandler(props)}>
      {segments.length === 0 ? <ProjectTimelineEffectLaneEmptyLabel /> : null}
      {segments.map((segment) => (
        <ProjectTimelineEffectSegment
          key={segment.id}
          className={ACTIONS_LANE_SEGMENT_CLASS_NAME}
          hidden={!props.laneVisible}
          isSelected={isSelectedEffectSegment(props.selectedEffectSelection, 'action', segment.id)}
          label={segment.event.label}
          left={segment.start * props.pixelsPerSecond}
          onBeginEffectInteraction={(event) =>
            props.onBeginEffectInteraction(event, createActionTarget(segment, 'move'))
          }
          onBeginTrimEndInteraction={(event) =>
            props.onBeginEffectInteraction(event, createActionTarget(segment, 'resize-end'))
          }
          subtitle={[
            getActionPresetLabel(segment.event.preset),
            `${formatTime(segment.start)} - ${formatTime(segment.end)}`,
          ].join(' · ')}
          width={Math.max(18, (segment.end - segment.start) * props.pixelsPerSecond)}
        />
      ))}
    </ProjectTimelineEffectLaneRow>
  );
}

function createActionTarget(
  segment: ReturnType<typeof buildVideoCompositionActionSegments>[number],
  mode: 'move' | 'resize-end'
) {
  return {
    actionEventId: segment.event.id,
    kind: 'action' as const,
    mode,
    originalDuration: segment.event.duration,
    originalTime: segment.start,
    segmentId: segment.id,
  };
}

function rangeSelectionHandler(props: UtilityLaneProps): React.PointerEventHandler<HTMLDivElement> {
  return (event) => {
    if (event.target === event.currentTarget) props.onBeginRangeSelection(event);
  };
}
