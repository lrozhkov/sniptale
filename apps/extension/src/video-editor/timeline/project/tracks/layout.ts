import { buildVideoCompositionTransitionSegments } from '../../../../features/video/composition/timeline/lanes';
import { createVideoProjectClipLogicalLaneId } from '../../../../features/video/project/timeline/logical-lanes';
import type { VideoProject } from '../../../../features/video/project/types';
import type { VideoEditorTrackHeightMultiplier } from '../../../persistence/track-panel';
import { TRACK_ROW_HEIGHT } from '../interaction-state/helpers';
import type { TimelineJunctionZone } from './zones/index';
import {
  buildTimelineTrackClipRows,
  getTimelineTrackLogicalLaneMetrics,
  getTimelineTrackLogicalRowCount,
  type TimelineLogicalLaneMetrics,
} from './stacking';

export interface TimelineTrackLayout {
  center: number;
  clipRowHeight: number;
  junctionZones: TimelineJunctionZone[];
  logicalLaneMetrics: ReadonlyMap<string, TimelineLogicalLaneMetrics>;
  logicalRowHeight: number;
  logicalRows: number;
  rowHeight: number;
  top: number;
  trackBaseRowHeight: number;
  trackId: string;
  transitionRowCount: number;
}

export interface TimelineTrackLayoutModel {
  layoutByTrackId: Map<string, TimelineTrackLayout>;
  layouts: TimelineTrackLayout[];
  totalTrackHeight: number;
}

const NEW_LOGICAL_LANE_HOVER_ZONE_PX = 36;

export function buildTimelineTrackLayoutModel(params: {
  project: VideoProject;
  trackHeightByTrackId: Record<string, VideoEditorTrackHeightMultiplier>;
  tracks: VideoProject['tracks'];
}): TimelineTrackLayoutModel {
  const layouts: TimelineTrackLayout[] = [];
  const layoutByTrackId = new Map<string, TimelineTrackLayout>();
  let top = 0;

  for (const track of params.tracks) {
    const multiplier = params.trackHeightByTrackId[track.id] ?? 1;
    const trackBaseRowHeight = Math.round(TRACK_ROW_HEIGHT * multiplier);
    const logicalRows = getTimelineTrackLogicalRowCount(params.project, track.id);
    const logicalLaneMetrics = getTimelineTrackLogicalLaneMetrics({
      clipRows: buildTimelineTrackClipRows(params.project, track.id),
      project: params.project,
      trackBaseRowHeight,
      trackId: track.id,
      transitionSegments: buildVideoCompositionTransitionSegments(params.project),
    });
    const clipRowHeight = Math.max(
      trackBaseRowHeight * logicalRows,
      [...logicalLaneMetrics.values()].reduce((total, metrics) => total + metrics.rowHeight, 0)
    );
    const logicalRowHeight = clipRowHeight / logicalRows;
    const transitionRowCount = 0;
    const rowHeight = clipRowHeight;
    const layout = {
      center: top + rowHeight / 2,
      clipRowHeight,
      junctionZones: [],
      logicalLaneMetrics,
      logicalRowHeight,
      logicalRows,
      rowHeight,
      top,
      trackBaseRowHeight,
      trackId: track.id,
      transitionRowCount,
    };

    layouts.push(layout);
    layoutByTrackId.set(track.id, layout);
    top += rowHeight;
  }

  return { layoutByTrackId, layouts, totalTrackHeight: top };
}

export function resolveTimelineTrackLayoutModel(params: {
  project: VideoProject;
  trackHeightByTrackId: Record<string, VideoEditorTrackHeightMultiplier>;
  trackLayoutModel: TimelineTrackLayoutModel | undefined;
  tracks: VideoProject['tracks'];
}): TimelineTrackLayoutModel {
  return (
    params.trackLayoutModel ??
    buildTimelineTrackLayoutModel({
      project: params.project,
      trackHeightByTrackId: params.trackHeightByTrackId,
      tracks: params.tracks,
    })
  );
}

export function resolveTrackIdFromClientY(params: {
  currentClientY: number;
  layoutModel: TimelineTrackLayoutModel;
  originalClientY: number;
  originalTrackId: string;
}): string | undefined {
  const originalLayout = params.layoutModel.layoutByTrackId.get(params.originalTrackId);
  if (!originalLayout) {
    return params.originalTrackId;
  }

  const pointerCenter = originalLayout.center + params.currentClientY - params.originalClientY;
  return findNearestTrackLayout(params.layoutModel.layouts, pointerCenter)?.trackId;
}

interface TimelineTrackPlacement {
  timelineLaneId: string;
  trackId: string;
}

export function resolveTrackPlacementFromClientY(params: {
  currentClientY: number;
  layoutModel: TimelineTrackLayoutModel;
  originalClientY: number;
  originalTimelineLaneId?: string | null;
  originalTrackId: string;
}): TimelineTrackPlacement | undefined {
  const originalLayout = params.layoutModel.layoutByTrackId.get(params.originalTrackId);
  if (!originalLayout) {
    return {
      timelineLaneId: createVideoProjectClipLogicalLaneId(0),
      trackId: params.originalTrackId,
    };
  }

  const projectedY =
    resolveOriginalLaneAnchorY(originalLayout, params.originalTimelineLaneId) +
    params.currentClientY -
    params.originalClientY;
  const targetLayout = resolveDragTargetTrackLayout(
    params.layoutModel.layouts,
    originalLayout,
    projectedY
  );
  if (!targetLayout) {
    return undefined;
  }

  const relativeY = Math.max(0, projectedY - targetLayout.top);
  const targetLane = findLogicalLaneMetrics(targetLayout, relativeY);
  const fallbackRowIndex = Math.floor(relativeY / Math.max(1, targetLayout.logicalRowHeight));
  return {
    timelineLaneId:
      targetLane?.logicalLaneId ?? createVideoProjectClipLogicalLaneId(fallbackRowIndex),
    trackId: targetLayout.trackId,
  };
}

function resolveOriginalLaneAnchorY(
  originalLayout: TimelineTrackLayout,
  originalTimelineLaneId: string | null | undefined
): number {
  const laneMetrics = originalTimelineLaneId
    ? originalLayout.logicalLaneMetrics.get(originalTimelineLaneId)
    : undefined;
  return laneMetrics
    ? originalLayout.top + laneMetrics.clipTop + laneMetrics.clipRowHeight / 2
    : originalLayout.center;
}

function resolveDragTargetTrackLayout(
  layouts: TimelineTrackLayout[],
  originalLayout: TimelineTrackLayout,
  projectedY: number
): TimelineTrackLayout | undefined {
  if (isInsideOriginalTrackCreationZone(originalLayout, projectedY)) {
    return originalLayout;
  }
  return (
    findContainingTrackLayout(layouts, projectedY) ?? findNearestTrackLayout(layouts, projectedY)
  );
}

function isInsideOriginalTrackCreationZone(
  originalLayout: TimelineTrackLayout,
  projectedY: number
): boolean {
  const creationZoneHeight =
    originalLayout.logicalRows > 1
      ? originalLayout.trackBaseRowHeight * 2
      : Math.min(originalLayout.logicalRowHeight * 0.75, NEW_LOGICAL_LANE_HOVER_ZONE_PX);
  const extendedBottom = originalLayout.top + originalLayout.rowHeight + creationZoneHeight;
  return projectedY >= originalLayout.top && projectedY < extendedBottom;
}

function findContainingTrackLayout(
  layouts: TimelineTrackLayout[],
  projectedY: number
): TimelineTrackLayout | undefined {
  return layouts.find(
    (layout) => projectedY >= layout.top && projectedY < layout.top + layout.rowHeight
  );
}

function findNearestTrackLayout(
  layouts: TimelineTrackLayout[],
  pointerCenter: number
): TimelineTrackLayout | undefined {
  return layouts.reduce<TimelineTrackLayout | undefined>((nearestLayout, layout) => {
    if (!nearestLayout) {
      return layout;
    }

    return Math.abs(layout.center - pointerCenter) < Math.abs(nearestLayout.center - pointerCenter)
      ? layout
      : nearestLayout;
  }, undefined);
}

function findLogicalLaneMetrics(
  layout: TimelineTrackLayout,
  relativeY: number
): TimelineLogicalLaneMetrics | undefined {
  const metrics = [...layout.logicalLaneMetrics.values()];
  return metrics.find(
    (item) => relativeY >= item.rowTop && relativeY < item.rowTop + item.rowHeight
  );
}
