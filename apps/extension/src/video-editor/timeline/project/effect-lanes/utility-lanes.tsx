import type { VideoProjectMotionRegion } from '../../../../features/video/project/types';
import { buildVideoCompositionMotionSegments } from '../../../../features/video/composition/timeline/lanes';
import { getVideoProjectUtilityLanes } from '../../../../features/video/project/utility-lanes';
import { translate } from '../../../../platform/i18n';
import type { TimelineEffectDragTarget } from '../types';
import { buildTimelineMotionSegments, getTimelineUtilityRowPresence } from './segments';
import type { UtilityLaneProps } from './utility-lane-types';
import { isSelectedEffectSegment, ProjectTimelineEffectSegment } from './segment';
import { ProjectTimelineEffectLaneEmptyLabel, ProjectTimelineEffectLaneRow } from './ui';
import {
  resolveMotionConnectionSource,
  resolveMotionConnectionCandidate,
} from '../../../../features/video/project/motion';
import { VideoEditorSelectionKind } from '../../../contracts/selection';
import { projectTimelineInterval } from '../interaction-state/projection';
import { Focus, Frame, MoveRight, ZoomIn, ZoomOut } from 'lucide-react';
import { TIMELINE_OBJECT_MARKER_PROPS } from '../canvas/hover-preview';

const MOTION_LANE_SEGMENT_CLASS_NAME = [
  'border-[var(--sniptale-color-border-soft)]',
  'bg-[var(--sniptale-color-surface-input)]',
].join(' ');

export function ProjectTimelineEffectCanvasRows(
  props: UtilityLaneProps & {
    cursorLaneVisible?: boolean;
    selection?: import('../../../contracts/selection').VideoEditorSelection;
    onSelectActionOccurrence?: (eventId: string, clipId: string | null) => void;
    onSelectCursorSegment?: (sampleId: string) => void;
    onSelectMotionRegion?: (motionRegionId: string, part?: 'connection') => void;
    onSelectObjectTrack?: (objectTrackId: string) => void;
    onSelectTransition?: (transitionId: string) => void;
  }
): React.JSX.Element {
  const utilityLanes = getVideoProjectUtilityLanes(props.project);
  const rows = getTimelineUtilityRowPresence(props.project);
  return (
    <>
      {rows.motion ? (
        <ProjectTimelineMotionLane {...props} laneVisible={utilityLanes.camera.visible} />
      ) : null}
    </>
  );
}

function ProjectTimelineMotionLane(props: UtilityLaneProps & { laneVisible: boolean }) {
  const segments = resolveMotionLaneSegments(props);
  return (
    <ProjectTimelineEffectLaneRow
      muted={!props.laneVisible}
      onPointerDown={props.onBeginRangeSelection}
    >
      <MotionLaneEmptyState visible={segments.length === 0} />
      <MotionConnections {...props} />
      <MotionSegments {...props} segments={segments} />
    </ProjectTimelineEffectLaneRow>
  );
}

function MotionConnections(props: UtilityLaneProps & { laneVisible: boolean }) {
  const states = (props.project.motionRegions ?? [])
    .filter((region) => !region.border && region.duration > 0)
    .sort((a, b) => a.startTime - b.startTime);
  const locked = getVideoProjectUtilityLanes(props.project).camera.locked;
  return states.map((destination) => (
    <MotionConnection
      key={destination.id}
      props={props}
      destination={destination}
      locked={locked}
    />
  ));
}

function MotionConnection({
  props,
  destination,
  locked,
}: {
  props: UtilityLaneProps & { laneVisible: boolean };
  destination: VideoProjectMotionRegion;
  locked: boolean;
}) {
  const source = resolveMotionConnectionCandidate(props.project, destination);
  if (!source) return null;
  const start = source.startTime + source.duration;
  const end = destination.startTime;
  const geometry = props.projection
    ? projectTimelineInterval(props.projection, start, end)
    : {
        left: start * props.pixelsPerSecond,
        width: (end - start) * props.pixelsPerSecond,
      };
  if (!geometry || geometry.width <= 0) return null;
  const connected = resolveMotionConnectionSource(props.project, destination) !== null;
  const selected =
    props.selection?.kind === VideoEditorSelectionKind.MOTION_CONNECTION &&
    props.selection.motionRegionId === destination.id;
  const label = translate(
    destination.spotlight
      ? connected
        ? 'videoEditor.sidebar.spotlightConnection'
        : 'videoEditor.sidebar.connectSpotlight'
      : connected
        ? 'videoEditor.timeline.framingConnection'
        : 'videoEditor.timeline.connectFraming'
  );
  if (!connected)
    return (
      <AvailableMotionConnection
        props={props}
        source={source}
        destination={destination}
        geometry={geometry}
        locked={locked}
        label={label}
      />
    );

  return (
    <button
      key={destination.id}
      type="button"
      data-ui="video-editor.timeline.framing-connection"
      data-framing-destination={destination.id}
      {...TIMELINE_OBJECT_MARKER_PROPS}
      aria-label={label}
      aria-pressed={selected}
      title={label}
      className={[
        `absolute top-1/2 flex h-7 -translate-y-1/2 items-center justify-center
overflow-hidden rounded border text-xs transition-opacity`,
        '!cursor-pointer disabled:pointer-events-none disabled:opacity-40',
        'video-editor-timeline-item',
        selected ? 'video-editor-timeline-item-selected' : '',
        'border-[var(--sniptale-color-border-soft)] text-[var(--sniptale-color-text-secondary)]',
        'bg-[var(--sniptale-color-surface-panel)]',
      ].join(' ')}
      style={{ left: geometry.left, width: geometry.width }}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        props.onSelectMotionRegion?.(destination.id, 'connection');
      }}
    >
      <MoveRight size={16} aria-hidden="true" />
      {geometry.width > 180 ? <span className="ml-1.5 truncate">{label}</span> : null}
    </button>
  );
}

function AvailableMotionConnection({
  props,
  source,
  destination,
  geometry,
  locked,
  label,
}: {
  props: UtilityLaneProps & { laneVisible: boolean };
  source: VideoProjectMotionRegion;
  destination: VideoProjectMotionRegion;
  geometry: { left: number; width: number };
  locked: boolean;
  label: string;
}) {
  return (
    <div
      key={destination.id}
      data-ui="video-editor.timeline.framing-connection"
      data-framing-destination={destination.id}
      className="group absolute top-1/2 h-7 -translate-y-1/2"
      style={{ left: geometry.left, width: geometry.width }}
    >
      {!locked && props.laneVisible && props.onConnectMotionRegions ? (
        <span
          aria-hidden="true"
          data-ui="video-editor.timeline.framing-connection-preview"
          className={[
            'pointer-events-none absolute inset-0 rounded border border-dashed',
            'border-[var(--sniptale-color-border-soft)] opacity-0',
            'group-hover:opacity-100 group-focus-within:opacity-100',
          ].join(' ')}
        />
      ) : null}
      <button
        type="button"
        data-ui="video-editor.timeline.add-framing-connection"
        {...TIMELINE_OBJECT_MARKER_PROPS}
        aria-label={label}
        title={label}
        disabled={locked || !props.laneVisible || !props.onConnectMotionRegions}
        className={[
          'absolute left-1/2 flex h-7 w-7 max-w-full -translate-x-1/2 items-center justify-center',
          'overflow-hidden rounded-md border border-[var(--sniptale-color-border-soft)] shadow-sm',
          'bg-[var(--sniptale-color-surface-panel)] text-[var(--sniptale-color-text-secondary)]',
          'opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity',
          'hover:bg-[var(--sniptale-color-surface-hover)] cursor-pointer disabled:cursor-default',
          'disabled:opacity-0 focus-visible:outline focus-visible:outline-[var(--sniptale-color-focus-ring)]',
        ].join(' ')}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          props.onConnectMotionRegions?.(source.id, destination.id);
        }}
      >
        <MoveRight size={16} aria-hidden="true" />
      </button>
    </div>
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
    const border = segment.region.border;
    const spotlight = segment.region.spotlight;
    const label = translate(
      border
        ? 'gallery.videoReview.focusBorder'
        : spotlight
          ? 'gallery.videoReview.focusSpotlight'
          : 'videoEditor.timeline.motionSegment'
    );
    const subtitle = border || spotlight ? label : `${segment.region.scale.toFixed(2)}x`;
    return (
      <ProjectTimelineEffectSegment
        key={segment.id}
        segmentId={segment.id}
        movable={!getVideoProjectUtilityLanes(props.project).camera.locked}
        className={MOTION_LANE_SEGMENT_CLASS_NAME}
        height={28}
        isSelected={isSelectedEffectSegment(props.selectedEffectSelection, 'motion', segment.id)}
        label={label}
        hideLabel
        leadingIcon={
          border ? (
            <Frame size={14} aria-hidden="true" />
          ) : spotlight ? (
            <Focus size={14} aria-hidden="true" />
          ) : segment.region.scale < 1 ? (
            <ZoomOut size={14} aria-hidden="true" />
          ) : (
            <ZoomIn size={14} aria-hidden="true" />
          )
        }
        title={border || spotlight ? label : `${label} · ${subtitle}`}
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
