import { buildVideoCompositionTransitionSegments } from '../../../../../features/video/composition/timeline/lanes';
import { getTrackClips } from '../../../../../features/video/project/timeline';
import type { VideoProject } from '../../../../../features/video/project/types';
import type { TimelineClipPreviewMap } from '../../../../contracts/timeline-preview';
import { ProjectTimelineClip } from '../../clip/index';
import type { TimelineTrackLayout } from '../../tracks/layout';
import {
  buildTimelineTrackClipRows,
  getTimelineTrackLogicalLaneMetrics,
  type TimelineLogicalLaneMetrics,
} from '../../tracks/stacking';
import type { DragMode, TimelineEffectDragTarget, TimelineEffectSelection } from '../../types';

export function ProjectTimelineTrackClipStack(props: {
  hoveredClipId: string | null;
  pixelsPerSecond: number;
  project: VideoProject;
  selectedClipId: string | null;
  selectedEffectSelection: TimelineEffectSelection | null;
  timelinePreviews: TimelineClipPreviewMap;
  trackId: string;
  trackLayout: TimelineTrackLayout | undefined;
  trackLocked: boolean;
  onBeginClipInteraction: (
    event: React.PointerEvent,
    clip: VideoProject['clips'][number],
    mode: DragMode
  ) => void;
  onBeginEffectInteraction: (event: React.PointerEvent, target: TimelineEffectDragTarget) => void;
  onSelectClip: (clipId: string | null) => void;
  onSetHoveredClipId: (clipId: string | null) => void;
}) {
  const stackLayout = getTrackClipStackLayout(props);

  return (
    <div
      className="pointer-events-none absolute bottom-0 left-0 right-0"
      style={{ height: props.trackLayout?.clipRowHeight }}
    >
      <ProjectTimelineTrackClipItems {...props} {...stackLayout} />
    </div>
  );
}

function getTrackClipStackLayout(props: Parameters<typeof ProjectTimelineTrackClipStack>[0]) {
  const clipRows = buildTimelineTrackClipRows(props.project, props.trackId);
  const laneMetrics =
    props.trackLayout?.logicalLaneMetrics ??
    getTimelineTrackLogicalLaneMetrics({
      clipRows,
      project: props.project,
      trackBaseRowHeight: props.trackLayout?.trackBaseRowHeight ?? 0,
      trackId: props.trackId,
      transitionSegments: buildVideoCompositionTransitionSegments(props.project),
    });
  return { clipRows, laneMetrics };
}

function getClipLaneMetrics(
  clipRows: ReturnType<typeof buildTimelineTrackClipRows>,
  laneMetrics: ReadonlyMap<string, TimelineLogicalLaneMetrics>,
  clipId: string
) {
  const row = clipRows.get(clipId);
  return row ? laneMetrics.get(row.logicalLaneId) : undefined;
}

function ProjectTimelineTrackClipItems(
  props: Parameters<typeof ProjectTimelineTrackClipStack>[0] & {
    clipRows: ReturnType<typeof buildTimelineTrackClipRows>;
    laneMetrics: ReadonlyMap<string, TimelineLogicalLaneMetrics>;
  }
) {
  return getTrackClips(props.project, props.trackId).map((clip) => {
    const metrics = getClipLaneMetrics(props.clipRows, props.laneMetrics, clip.id);
    return (
      <ProjectTimelineClip
        key={clip.id}
        clip={clip}
        isHovered={props.hoveredClipId === clip.id}
        isSelected={props.selectedClipId === clip.id}
        pixelsPerSecond={props.pixelsPerSecond}
        {...(props.timelinePreviews[clip.id] ? { preview: props.timelinePreviews[clip.id] } : {})}
        project={props.project}
        trackLocked={props.trackLocked}
        {...resolveClipMetricsProps(metrics)}
        onBeginClipInteraction={props.onBeginClipInteraction}
        onClipHoverChange={props.onSetHoveredClipId}
        onSelectClip={props.onSelectClip}
      />
    );
  });
}

function resolveClipMetricsProps(metrics: TimelineLogicalLaneMetrics | undefined) {
  return metrics
    ? { trackClipRowHeight: metrics.clipRowHeight, trackClipTop: metrics.clipTop }
    : {};
}
