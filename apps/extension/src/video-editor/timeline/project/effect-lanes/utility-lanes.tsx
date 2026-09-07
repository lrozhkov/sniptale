import { buildVideoCompositionMotionSegments } from '../../../../features/video/composition/timeline/lanes';
import { getVideoProjectUtilityLanes } from '../../../../features/video/project/utility-lanes';
import { translate } from '../../../../platform/i18n';
import type { TimelineEffectDragTarget } from '../types';
import { ProjectTimelineActionsLane } from './action-lane';
import { ProjectTimelineCursorLane } from './cursor-lane';
import { buildTimelineMotionSegments, getTimelineUtilityRowPresence } from './segments';
import type { UtilityLaneProps } from './utility-lane-types';
import { isSelectedEffectSegment, ProjectTimelineEffectSegment } from './segment';
import { ProjectTimelineEffectLaneEmptyLabel, ProjectTimelineEffectLaneRow } from './ui';

const MOTION_LANE_SEGMENT_CLASS_NAME = [
  'border-[color:color-mix(in_srgb,var(--sniptale-color-warning)_28%,var(--sniptale-color-border-soft)_72%)]',
  'bg-[linear-gradient(',
  '135deg,color-mix(in_srgb,var(--sniptale-color-warning-soft)_82%,transparent),',
  'color-mix(in_srgb,var(--sniptale-color-accent-soft)_24%,transparent))]',
].join(' ');

export function ProjectTimelineEffectCanvasRows(
  props: UtilityLaneProps & {
    cursorLaneVisible?: boolean;
    selection?: import('../../../contracts/selection').VideoEditorSelection;
    onSelectActionSegment?: (actionEventId: string) => void;
    onSelectCursorSegment?: (sampleId: string) => void;
    onSelectMotionRegion?: (motionRegionId: string) => void;
    onSelectObjectTrack?: (objectTrackId: string) => void;
    onSelectTransition?: (transitionId: string) => void;
  }
): React.JSX.Element {
  const utilityLanes = getVideoProjectUtilityLanes(props.project);
  const rows = getTimelineUtilityRowPresence(props.project);
  return (
    <>
      {props.cursorLaneVisible !== false ? <ProjectTimelineCursorLane {...props} /> : null}
      {rows.actions ? (
        <ProjectTimelineActionsLane {...props} laneVisible={utilityLanes.actions.visible} />
      ) : null}
      {rows.motion ? (
        <ProjectTimelineMotionLane {...props} laneVisible={utilityLanes.camera.visible} />
      ) : null}
    </>
  );
}

function ProjectTimelineMotionLane(props: UtilityLaneProps & { laneVisible: boolean }) {
  const segments = resolveMotionLaneSegments(props);
  return (
    <ProjectTimelineEffectLaneRow>
      <MotionLaneEmptyState visible={segments.length === 0} />
      <MotionSegments {...props} segments={segments} />
    </ProjectTimelineEffectLaneRow>
  );
}

function resolveMotionLaneSegments(props: UtilityLaneProps & { laneVisible: boolean }) {
  return props.laneVisible
    ? buildVideoCompositionMotionSegments(props.project)
    : buildTimelineMotionSegments(props.project);
}

function MotionLaneEmptyState({ visible }: { visible: boolean }) {
  return visible ? (
    <ProjectTimelineEffectLaneEmptyLabel
      label={translate('videoEditor.timeline.emptyZoomLaneLabel')}
    />
  ) : null;
}

function MotionSegments(
  props: UtilityLaneProps & {
    laneVisible: boolean;
    segments: ReturnType<typeof buildVideoCompositionMotionSegments>;
  }
) {
  return props.segments.map((segment) => {
    const subtitle =
      segment.region.cameraMode === 'PATH'
        ? `${segment.region.path?.stops.length ?? 0} ${translate('videoEditor.sidebar.motionPathStopCountUnit')}`
        : `${segment.region.scale.toFixed(2)}x`;
    return (
      <ProjectTimelineEffectSegment
        key={segment.id}
        segmentId={segment.id}
        className={MOTION_LANE_SEGMENT_CLASS_NAME}
        hidden={!props.laneVisible}
        isSelected={isSelectedEffectSegment(props.selectedEffectSelection, 'motion', segment.id)}
        label={translate('videoEditor.timeline.motionLane')}
        startTime={segment.start}
        endTime={segment.end}
        pixelsPerSecond={props.pixelsPerSecond}
        projection={props.projection}
        minimumWidth={20}
        onBeginEffectInteraction={(event) =>
          props.onBeginEffectInteraction(event, createMotionDragTarget(segment, 'move'))
        }
        onBeginTrimStartInteraction={(event) =>
          props.onBeginEffectInteraction(event, createMotionDragTarget(segment, 'resize-start'))
        }
        onBeginTrimEndInteraction={(event) =>
          props.onBeginEffectInteraction(event, createMotionDragTarget(segment, 'resize-end'))
        }
        subtitle={subtitle}
      />
    );
  });
}

function createMotionDragTarget(
  segment: ReturnType<typeof buildVideoCompositionMotionSegments>[number],
  mode: 'move' | 'resize-start' | 'resize-end'
): TimelineEffectDragTarget {
  return {
    kind: 'motion',
    mode,
    motionRegionId: segment.region.id,
    originalDuration: segment.region.duration,
    originalStart: segment.start,
    segmentId: segment.id,
  };
}
