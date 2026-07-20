import type { VideoProject } from '../../../../features/video/project/types';
import type { TimelineTrackLayout } from './layout';

interface ProjectTimelineLogicalLaneRailProps {
  compactRows: boolean;
  track: VideoProject['tracks'][number];
  trackLayout: TimelineTrackLayout | undefined;
  onAddTrackLogicalLane: (trackId: string) => void;
}

type ProjectTimelineLogicalLaneMetric =
  TimelineTrackLayout['logicalLaneMetrics'] extends ReadonlyMap<string, infer TValue>
    ? TValue
    : never;

export function ProjectTimelineLogicalLaneRail(props: ProjectTimelineLogicalLaneRailProps) {
  const metrics = [...(props.trackLayout?.logicalLaneMetrics.values() ?? [])];
  if (props.compactRows || metrics.length <= 1) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute inset-0">
      {metrics.map((lane) => (
        <ProjectTimelineLogicalLaneRailSeparator key={lane.logicalLaneId} lane={lane} />
      ))}
    </div>
  );
}

function ProjectTimelineLogicalLaneRailSeparator({
  lane,
}: {
  lane: ProjectTimelineLogicalLaneMetric;
}) {
  return (
    <div
      data-project-timeline-logical-lane-rail={lane.logicalLaneId}
      className={[
        'absolute inset-x-0 border-t',
        'border-[color:var(--sniptale-color-border-subtle)] first:border-t-0',
      ].join(' ')}
      style={{ height: lane.rowHeight, top: lane.rowTop }}
    />
  );
}
