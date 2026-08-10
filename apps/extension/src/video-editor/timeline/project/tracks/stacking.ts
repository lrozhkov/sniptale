import type { VideoCompositionTransitionSegment } from '../../../../features/video/composition/types';
import { getTrackClips } from '../../../../features/video/project/timeline';
import {
  DEFAULT_LOGICAL_LANE_ID,
  type VideoProjectClipLogicalLaneAssignment,
} from '../../../../features/video/project/timeline/logical-lanes';
import type { VideoProject } from '../../../../features/video/project/types';

export const TIMELINE_TEMPLATE_SUB_LANE_HEIGHT = 18;
const TIMELINE_TRANSITION_BOUNDARY_GUTTER_HEIGHT = 18;

type TimelineLogicalRowAssignment = VideoProjectClipLogicalLaneAssignment;

export interface TimelineLogicalLaneMetrics {
  clipTop: number;
  clipRowHeight: number;
  logicalLaneId: string;
  rowHeight: number;
  rowIndex: number;
  rowTop: number;
  templateLaneAreaHeight: number;
  transitionBoundaryGutterHeight: number;
}

export function buildTimelineTrackClipRows(
  project: VideoProject,
  trackId: string
): Map<string, TimelineLogicalRowAssignment> {
  return new Map(
    getTrackClips(project, trackId).map((clip) => [
      clip.id,
      {
        logicalLaneId: DEFAULT_LOGICAL_LANE_ID,
        rowCount: 1,
        rowIndex: 0,
      },
    ])
  );
}

export function getTimelineTrackLogicalRowCount(_project: VideoProject, _trackId: string): number {
  return 1;
}

export function getTimelineTrackLogicalLaneMetrics(params: {
  project: VideoProject;
  trackBaseRowHeight: number;
  trackId: string;
  transitionSegments: readonly VideoCompositionTransitionSegment[];
  clipRows?: ReadonlyMap<string, TimelineLogicalRowAssignment>;
}): Map<string, TimelineLogicalLaneMetrics> {
  const clipRows = params.clipRows ?? buildTimelineTrackClipRows(params.project, params.trackId);
  const laneIds = [DEFAULT_LOGICAL_LANE_ID];
  const transitionLaneIds = getTimelineTrackTransitionLogicalLaneIds(
    params.transitionSegments,
    clipRows
  );
  const metrics = new Map<string, TimelineLogicalLaneMetrics>();
  let rowTop = 0;

  for (const [rowIndex, laneId] of laneIds.entries()) {
    const templateLaneAreaHeight = 0;
    const transitionBoundaryGutterHeight = transitionLaneIds.has(laneId)
      ? TIMELINE_TRANSITION_BOUNDARY_GUTTER_HEIGHT
      : 0;
    const rowHeight =
      params.trackBaseRowHeight + templateLaneAreaHeight + transitionBoundaryGutterHeight;
    metrics.set(laneId, {
      clipRowHeight: params.trackBaseRowHeight,
      clipTop: rowTop + templateLaneAreaHeight + transitionBoundaryGutterHeight,
      logicalLaneId: laneId,
      rowHeight,
      rowIndex,
      rowTop,
      templateLaneAreaHeight,
      transitionBoundaryGutterHeight,
    });
    rowTop += rowHeight;
  }

  return metrics;
}

function getTimelineTrackTransitionLogicalLaneIds(
  transitionSegments: readonly VideoCompositionTransitionSegment[],
  clipRows: ReadonlyMap<string, TimelineLogicalRowAssignment>
): Set<string> {
  return new Set(
    transitionSegments.flatMap((segment) => {
      const row = clipRows.get(segment.leadingClipId);
      return row ? [row.logicalLaneId] : [];
    })
  );
}
