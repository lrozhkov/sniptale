import { AudioGapRecordingAction, AudioRecordingZones } from '../../tracks/zones/audio-recording';
import type { TimelineProjection } from '../../interaction-state/projection';
import { useState } from 'react';
import type { VideoProject } from '../../../../../features/video/project/types';
import type { TimelineClipPreviewMap } from '../../../../contracts/timeline-preview';
import {
  VideoEditorSelectionKind,
  type VideoEditorSelection,
} from '../../../../contracts/selection';
import type { TimelineTrackLayout, TimelineTrackLayoutModel } from '../../tracks/layout';
import {
  buildTrackGapZones,
  buildTrackCutZones,
  buildTrackJunctionZones,
  ProjectTimelineTrackZones,
} from '../../tracks/zones/index';
import type {
  DragMode,
  TimelineClipDragGhost,
  TimelineEffectDragTarget,
  TimelineEffectSelection,
  ProjectTimelineProps,
} from '../../types';
import {
  createTrackFileDragLeaveHandler,
  createTrackFileDragOverHandler,
  createTrackFileDropHandler,
  type TimelineFileDropParams,
} from './track-drop';
import { ProjectTimelineClipDragGhost } from './drag-ghost';
import { ProjectTimelineTrackClipStack } from './clip-stack';
import { ProjectTimelineLogicalLaneGuides } from './lane-guides';

interface ProjectTimelineTrackLanesProps {
  hiddenClipNamesByTrackId?: Readonly<Record<string, boolean>> | undefined;
  pixelsPerSecond: number;
  projection?: TimelineProjection | undefined;
  project: VideoProject;
  dragGhost: TimelineClipDragGhost | null;
  selection: VideoEditorSelection;
  hoveredClipId: string | null;
  selectedClipId: string | null;
  selectedEffectSelection: TimelineEffectSelection | null;
  selectedTrackId: string | null;
  timelinePreviews: TimelineClipPreviewMap;
  trackLayoutModel: TimelineTrackLayoutModel;
  tracks: VideoProject['tracks'];
  onBeginClipInteraction: (
    event: React.PointerEvent,
    clip: VideoProject['clips'][number],
    mode: DragMode
  ) => void;
  onBeginEffectInteraction: (event: React.PointerEvent, target: TimelineEffectDragTarget) => void;
  onBeginTrackRangeSelection: (trackId: string) => React.PointerEventHandler<HTMLDivElement>;
  onCloseTrackGap: (trackId: string, gapStart: number, gapEnd: number) => void;
  onDropTimelineFile: (params: TimelineFileDropParams) => void;
  onDropEffectDocument?: ProjectTimelineProps['onDropEffectDocument'];
  onSelectClip: (clipId: string | null, intent?: 'replace' | 'toggle' | 'range') => void;
  onSelectTransition: (transitionId: string) => void;
  onSetHoveredClipId: (clipId: string | null) => void;
  onUnsupportedTimelineFileDrop: () => void;
}

interface ProjectTimelineTrackLaneProps extends Omit<
  ProjectTimelineTrackLanesProps,
  'trackLayoutModel' | 'tracks'
> {
  dropActive: boolean;
  track: VideoProject['tracks'][number];
  trackLayout: TimelineTrackLayout | undefined;
  onSetDropTrackId: (trackId: string | null) => void;
}

export function ProjectTimelineTrackLanes(props: ProjectTimelineTrackLanesProps) {
  const [dropTrackId, setDropTrackId] = useState<string | null>(null);
  return props.tracks.map((track) => (
    <ProjectTimelineTrackLane
      key={track.id}
      hiddenClipNamesByTrackId={props.hiddenClipNamesByTrackId}
      dragGhost={props.dragGhost}
      pixelsPerSecond={props.pixelsPerSecond}
      projection={props.projection}
      project={props.project}
      selection={props.selection}
      hoveredClipId={props.hoveredClipId}
      selectedClipId={props.selectedClipId}
      selectedEffectSelection={props.selectedEffectSelection}
      selectedTrackId={props.selectedTrackId}
      timelinePreviews={props.timelinePreviews}
      track={track}
      trackLayout={props.trackLayoutModel.layoutByTrackId.get(track.id)}
      dropActive={dropTrackId === track.id}
      onBeginClipInteraction={props.onBeginClipInteraction}
      onBeginEffectInteraction={props.onBeginEffectInteraction}
      onBeginTrackRangeSelection={props.onBeginTrackRangeSelection}
      onCloseTrackGap={props.onCloseTrackGap}
      onDropTimelineFile={props.onDropTimelineFile}
      onDropEffectDocument={props.onDropEffectDocument}
      onSelectClip={props.onSelectClip}
      onSelectTransition={props.onSelectTransition}
      onSetHoveredClipId={props.onSetHoveredClipId}
      onSetDropTrackId={setDropTrackId}
      onUnsupportedTimelineFileDrop={props.onUnsupportedTimelineFileDrop}
    />
  ));
}

function ProjectTimelineTrackLane(props: ProjectTimelineTrackLaneProps) {
  const displayProject = getReorderDisplayProject(props.project, props.dragGhost);
  return (
    <div
      className={
        'group/audio ' +
        getTrackLaneClassName(
          props.selection,
          props.selectedTrackId,
          props.track.id,
          props.dropActive
        )
      }
      data-track-lane-id={props.track.id}
      data-timeline-lane-muted={!props.track.visible}
      style={{ height: props.trackLayout?.rowHeight }}
      {...createTrackLaneEventProps(props)}
    >
      <AudioRecordingZones
        project={props.project}
        trackId={props.track.id}
        pixelsPerSecond={props.pixelsPerSecond}
        projection={props.projection}
      />
      <ProjectTimelineLogicalLaneGuides trackLayout={props.trackLayout} />
      <ProjectTimelineTrackZones
        {...createTrackZoneProps({
          ...props,
          project: getDragDisplayProject(props.project, props.dragGhost),
        })}
      />
      <ProjectTimelineClipDragGhost
        dragGhost={props.dragGhost}
        pixelsPerSecond={props.pixelsPerSecond}
        projection={props.projection}
        trackId={props.track.id}
        trackLayout={props.trackLayout}
      />
      <ProjectTimelineTrackClipStack
        hideClipNames={props.hiddenClipNamesByTrackId?.[props.track.id] ?? false}
        pixelsPerSecond={props.pixelsPerSecond}
        projection={props.projection}
        project={displayProject}
        hoveredClipId={props.dragGhost?.activeReorder ? null : props.hoveredClipId}
        selectedClipId={
          props.dragGhost?.activeReorder ? props.dragGhost.clipId : props.selectedClipId
        }
        selectedClipIds={props.selection.kind === 'clip-group' ? props.selection.clipIds : []}
        selectedEffectSelection={props.selectedEffectSelection}
        timelinePreviews={props.timelinePreviews}
        trackId={props.track.id}
        trackLayout={props.trackLayout}
        trackLocked={props.track.locked}
        onBeginClipInteraction={props.onBeginClipInteraction}
        onBeginEffectInteraction={props.onBeginEffectInteraction}
        onSelectClip={props.onSelectClip}
        onSetHoveredClipId={props.onSetHoveredClipId}
      />
    </div>
  );
}

/** Presentation-only geometry; the gesture owner publishes the command on release. */
function getReorderDisplayProject(project: VideoProject, ghost: TimelineClipDragGhost | null) {
  if (!ghost?.activeReorder) return project;
  return getDragDisplayProject(project, ghost);
}

function getDragDisplayProject(project: VideoProject, ghost: TimelineClipDragGhost | null) {
  if (!ghost) return project;
  const placements = new Map(
    [ghost, ...(ghost.relatedClips ?? [])].map((clip) => [clip.clipId, clip])
  );
  return {
    ...project,
    clips: project.clips.map((clip) => {
      const placement = placements.get(clip.id);
      return placement
        ? {
            ...clip,
            startTime: placement.startTime,
            duration: placement.duration,
            trackId: placement.trackId,
            timelineLaneId: placement.timelineLaneId,
          }
        : clip;
    }),
  };
}

function createTrackLaneEventProps(props: ProjectTimelineTrackLaneProps) {
  return {
    onClick: (event: React.MouseEvent) => event.stopPropagation(),
    onDragLeave: createTrackFileDragLeaveHandler(props.onSetDropTrackId),
    onDragOver: createTrackFileDragOverHandler(props.track.id, props.onSetDropTrackId),
    onDrop: createTrackFileDropHandler({
      onDropTimelineFile: props.onDropTimelineFile,
      onSetDropTrackId: props.onSetDropTrackId,
      onUnsupportedTimelineFileDrop: props.onUnsupportedTimelineFileDrop,
      resolveTimelineLaneId: (event) =>
        resolveTimelineLaneIdFromDropEvent(event, props.trackLayout),
      trackId: props.track.id,
    }),
    onPointerDown: createTrackLaneRangeSelectionHandler(
      props.track.id,
      props.onBeginTrackRangeSelection
    ),
  };
}

function resolveTimelineLaneIdFromDropEvent(
  event: React.DragEvent<HTMLDivElement>,
  trackLayout: TimelineTrackLayout | undefined
): string | null {
  if (!trackLayout) {
    return null;
  }

  const rect = event.currentTarget.getBoundingClientRect();
  const relativeY = event.clientY - rect.top;
  for (const metrics of trackLayout.logicalLaneMetrics.values()) {
    if (relativeY >= metrics.rowTop && relativeY < metrics.rowTop + metrics.rowHeight) {
      return metrics.logicalLaneId;
    }
  }

  return null;
}

function createTrackZoneProps(props: {
  onBeginClipInteraction: ProjectTimelineTrackLanesProps['onBeginClipInteraction'];
  pixelsPerSecond: number;
  projection?: TimelineProjection | undefined;
  project: VideoProject;
  track: VideoProject['tracks'][number];
  onCloseTrackGap: (trackId: string, gapStart: number, gapEnd: number) => void;
  onDropEffectDocument?: ProjectTimelineProps['onDropEffectDocument'];
  onSelectTransition: (transitionId: string) => void;
  selection: VideoEditorSelection;
}): React.ComponentProps<typeof ProjectTimelineTrackZones> {
  return {
    onBeginTransitionTrim: props.track.locked
      ? undefined
      : (event, transitionId, edge) => {
          const transition = props.project.transitions?.find((item) => item.id === transitionId);
          const clipId = edge === 'start' ? transition?.trailingClipId : transition?.leadingClipId;
          const clip = props.project.clips.find((item) => item.id === clipId);
          if (!clip) return;
          props.onBeginClipInteraction(event, clip, edge === 'start' ? 'trim-start' : 'trim-end');
          props.onSelectTransition(transitionId);
        },
    cutZones: buildTrackCutZones(props.project, props.track.id),
    gapZones: buildTrackGapZones(props.project, props.track.id),
    renderGapAction: (zone) => (
      <AudioGapRecordingAction project={props.project} trackId={props.track.id} range={zone} />
    ),
    junctionZones: buildTrackJunctionZones(props.project, props.track.id),
    pixelsPerSecond: props.pixelsPerSecond,
    projection: props.projection,
    selectedTransitionId:
      props.selection.kind === VideoEditorSelectionKind.TRANSITION_JUNCTION
        ? props.selection.transitionId
        : null,
    onCloseTrackGap: props.onCloseTrackGap,
    onDropEffectDocument: props.onDropEffectDocument,
    onSelectTransition: props.onSelectTransition,
  };
}

function createTrackLaneRangeSelectionHandler(
  trackId: string,
  onBeginTrackRangeSelection: (trackId: string) => React.PointerEventHandler<HTMLDivElement>
) {
  return (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) {
      return;
    }

    onBeginTrackRangeSelection(trackId)(event);
  };
}

function isSelectedTrackLane(selection: VideoEditorSelection, trackId: string): boolean {
  return selection.kind === VideoEditorSelectionKind.TRACK && selection.trackId === trackId;
}

function getTrackLaneClassName(
  selection: VideoEditorSelection,
  selectedTrackId: string | null,
  trackId: string,
  dropActive: boolean
) {
  const dropClassName = dropActive
    ? 'bg-[color:color-mix(in_srgb,var(--sniptale-color-accent-soft)_32%,transparent)]'
    : '';
  const dropRingClassName = dropActive
    ? 'ring-2 ring-inset ring-[color:var(--sniptale-color-accent)]'
    : '';
  if (selectedTrackId === trackId || isSelectedTrackLane(selection, trackId)) {
    return [
      'relative border-b',
      'border-[var(--sniptale-color-border-subtle)]',
      'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_90%,transparent)]',
      dropClassName,
      dropRingClassName,
    ].join(' ');
  }

  return [
    'relative border-b border-[var(--sniptale-color-border-subtle)]',
    dropClassName,
    dropRingClassName,
  ].join(' ');
}
