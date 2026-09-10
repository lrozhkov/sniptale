import { packTimelineFxRows } from './fx-layout';
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
  fxInstanceIds: string[];
  fxRows: string[][];
  fxCollapsed: boolean;
  fxHeight: number;
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
  videoFx?: {
    fxInstanceIds: string[];
    fxRows: string[][];
    fxCollapsed: boolean;
    fxHeight: number;
    clipRowHeight: number;
    top: number;
  };
  layoutByTrackId: Map<string, TimelineTrackLayout>;
  layouts: TimelineTrackLayout[];
  totalTrackHeight: number;
}

export function buildTimelineTrackLayoutModel(params: {
  collapsedFxByTrackId?: Readonly<Record<string, boolean>> | undefined;
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
    const clipIds = new Set(
      params.project.clips.filter((clip) => clip.trackId === track.id).map((clip) => clip.id)
    );
    const fxInstances = (params.project.effectInstances ?? []).filter(
      (instance) =>
        instance.kind === 'targetEffect' &&
        ((instance.target.kind === 'clip' && clipIds.has(instance.target.clipId)) ||
          (instance.target.kind === 'track' && instance.target.trackId === track.id))
    );
    const fxInstanceIds = fxInstances.map((instance) => instance.id);
    const fxRows = packTimelineFxRows(fxInstances);
    const fxCollapsed = params.collapsedFxByTrackId?.[track.id] ?? false;
    const fxHeight = fxInstanceIds.length ? (fxCollapsed ? 20 : fxRows.length * 24) : 0;
    const rowHeight = clipRowHeight + fxHeight;
    const layout = {
      fxInstanceIds,
      fxRows,
      fxCollapsed,
      fxHeight,
      center: top + clipRowHeight / 2,
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

  const globalInstances = (params.project.effectInstances ?? []).filter(
    (instance) => instance.kind === 'targetEffect' && instance.target.kind === 'video-group'
  );
  const globalIds = globalInstances.map((instance) => instance.id);
  const globalRows = packTimelineFxRows(globalInstances);
  const collapsed = params.collapsedFxByTrackId?.['video-group'] ?? false;
  const videoFx = globalIds.length
    ? {
        fxInstanceIds: globalIds,
        fxRows: globalRows,
        fxCollapsed: collapsed,
        fxHeight: collapsed ? 20 : globalRows.length * 24,
        clipRowHeight: 0,
        top,
      }
    : undefined;
  return {
    layoutByTrackId,
    layouts,
    totalTrackHeight: top + (videoFx?.fxHeight ?? 0),
    ...(videoFx ? { videoFx } : {}),
  };
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

  const projectedY = originalLayout.center + params.currentClientY - params.originalClientY;
  const targetLayout =
    findContainingTrackLayout(params.layoutModel.layouts, projectedY) ??
    findNearestTrackLayout(params.layoutModel.layouts, projectedY);
  if (!targetLayout) {
    return undefined;
  }

  return {
    timelineLaneId: createVideoProjectClipLogicalLaneId(0),
    trackId: targetLayout.trackId,
  };
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
