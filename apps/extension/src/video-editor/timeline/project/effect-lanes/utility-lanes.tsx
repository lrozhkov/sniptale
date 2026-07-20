import { useState } from 'react';

import { buildVideoCompositionMotionSegments } from '../../../../features/video/composition/timeline/lanes';
import { getVideoProjectUtilityLanes } from '../../../../features/video/project/utility-lanes';
import { translate } from '../../../../platform/i18n';
import type { TimelineEffectDragTarget } from '../types';
import { ProjectTimelineActionsLane } from './action-lane';
import { ProjectTimelineCursorLane } from './cursor-lane';
import {
  ProjectTimelineMotionLaneAddPreview,
  type MotionLaneAddPreview,
} from './motion-add-preview';
import { resolveMotionLaneAddPreview } from './motion-add-preview-model';
import { buildTimelineMotionSegments } from './segments';
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
  return (
    <>
      {props.cursorLaneVisible !== false ? <ProjectTimelineCursorLane {...props} /> : null}
      <ProjectTimelineActionsLane {...props} laneVisible={utilityLanes.actions.visible} />
      <ProjectTimelineMotionLane
        {...props}
        laneLocked={utilityLanes.camera.locked}
        laneVisible={utilityLanes.camera.visible}
      />
    </>
  );
}

function ProjectTimelineMotionLane(
  props: UtilityLaneProps & { laneLocked: boolean; laneVisible: boolean }
) {
  const [addPreview, setAddPreview] = useState<MotionLaneAddPreview | null>(null);
  const segments = props.laneVisible
    ? buildVideoCompositionMotionSegments(props.project)
    : buildTimelineMotionSegments(props.project);
  const previewHandler = createMotionLanePreviewHandler(props, setAddPreview);
  return (
    <ProjectTimelineEffectLaneRow
      onClick={previewHandler}
      onMouseLeave={() => setAddPreview(null)}
      onMouseMove={previewHandler}
    >
      {segments.length === 0 ? <ProjectTimelineEffectLaneEmptyLabel /> : null}
      <ProjectTimelineMotionLaneAddPreview
        preview={addPreview}
        onAddMotionRegion={props.onAddMotionRegion}
        onClearPreview={() => setAddPreview(null)}
      />
      <MotionSegments {...props} segments={segments} />
    </ProjectTimelineEffectLaneRow>
  );
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
        className={MOTION_LANE_SEGMENT_CLASS_NAME}
        hidden={!props.laneVisible}
        isSelected={isSelectedEffectSegment(props.selectedEffectSelection, 'motion', segment.id)}
        label={translate('videoEditor.timeline.motionLane')}
        left={segment.start * props.pixelsPerSecond}
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
        width={Math.max(20, (segment.end - segment.start) * props.pixelsPerSecond)}
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

function createMotionLanePreviewHandler(
  props: UtilityLaneProps & { laneLocked: boolean; laneVisible: boolean },
  setAddPreview: React.Dispatch<React.SetStateAction<MotionLaneAddPreview | null>>
): React.MouseEventHandler<HTMLDivElement> {
  return (event) => {
    if (props.laneLocked || !props.laneVisible) return;
    const timeline = props.timelineRef?.current;
    if (!timeline) return;
    setAddPreview((currentPreview) =>
      resolveMotionLaneAddPreview({
        clientX: event.clientX,
        currentPreview,
        pixelsPerSecond: props.pixelsPerSecond,
        timeline,
      })
    );
  };
}
