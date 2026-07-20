import type { TimelineTrackLayout } from '../../tracks/layout';
import { TIMELINE_TEMPLATE_SUB_LANE_HEIGHT } from '../../tracks/stacking';

export function ProjectTimelineLogicalLaneGuides({
  trackLayout,
}: {
  trackLayout: TimelineTrackLayout | undefined;
}) {
  const metrics = [...(trackLayout?.logicalLaneMetrics.values() ?? [])];
  return (
    <div className="pointer-events-none absolute inset-0">
      {metrics.slice(1).map((lane) => (
        <span
          key={lane.logicalLaneId}
          className="absolute inset-x-0 border-t border-dashed border-[color:var(--sniptale-color-border-subtle)]"
          style={{ top: lane.rowTop }}
        />
      ))}
      {metrics.map((lane) => (
        <ProjectTimelineLogicalLaneTemplateGuides key={lane.logicalLaneId} lane={lane} />
      ))}
    </div>
  );
}

function ProjectTimelineLogicalLaneTemplateGuides({
  lane,
}: {
  lane: TimelineTrackLayout['logicalLaneMetrics'] extends ReadonlyMap<string, infer TValue>
    ? TValue
    : never;
}) {
  const templateGuideCount = Math.floor(
    lane.templateLaneAreaHeight / TIMELINE_TEMPLATE_SUB_LANE_HEIGHT
  );
  return (
    <>
      {Array.from({ length: templateGuideCount }).map((_, index) => (
        <span
          key={`${lane.logicalLaneId}:template:${index}`}
          data-project-timeline-template-sublane-guide={lane.logicalLaneId}
          className={[
            'absolute inset-x-0 border-t',
            'border-[color:color-mix(in_srgb,var(--sniptale-color-info)_16%,transparent)]',
          ].join(' ')}
          style={{ top: lane.rowTop + index * TIMELINE_TEMPLATE_SUB_LANE_HEIGHT }}
        />
      ))}
      {lane.transitionBoundaryGutterHeight > 0 ? (
        <span
          data-project-timeline-transition-gutter={lane.logicalLaneId}
          className={[
            'absolute inset-x-0 border-t border-dashed',
            'border-[color:color-mix(in_srgb,#7c3aed_26%,transparent)]',
          ].join(' ')}
          style={{ top: lane.rowTop + lane.templateLaneAreaHeight }}
        />
      ) : null}
    </>
  );
}
