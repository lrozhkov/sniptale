import { useMemo } from 'react';
import { TimelineEffectDraftContext } from './effect-lanes/segment';
import { ProjectTimelineBody } from './body';
import { ProjectTimelineSurface } from './surface';
import type { ProjectTimelineProps } from './types';
import type { useProjectTimelinePanelPrefs } from './panel/prefs';
import { useProjectTimelineState } from './interaction-state/index';

export const ProjectTimeline = (
  props: ProjectTimelineProps & { panelPrefs: ReturnType<typeof useProjectTimelinePanelPrefs> }
) => {
  const { panelPrefs } = props;
  const heights = useMemo(
    () =>
      panelPrefs.prefs.compactRows
        ? Object.fromEntries(
            props.project.tracks.map(({ id }) => [
              id,
              Math.max(0.5, (panelPrefs.prefs.trackHeightByTrackId[id] ?? 1) * 0.75),
            ])
          )
        : panelPrefs.prefs.trackHeightByTrackId,
    [panelPrefs.prefs, props.project.tracks]
  );
  const timelineState = useProjectTimelineState(
    { ...props, collapsedFxByTrackId: panelPrefs.prefs.collapsedFxByTrackId },
    heights
  );

  return (
    <TimelineEffectDraftContext.Provider value={timelineState.effectDragDraft}>
      <ProjectTimelineLayout {...props} {...timelineState} panelPrefs={panelPrefs} />
    </TimelineEffectDraftContext.Provider>
  );
};

function ProjectTimelineLayout(
  props: ProjectTimelineProps &
    ReturnType<typeof useProjectTimelineState> & {
      panelPrefs: ReturnType<typeof useProjectTimelinePanelPrefs>;
    }
) {
  return (
    <ProjectTimelineSurface {...props}>
      <ProjectTimelineBody
        {...props}
        cursorLaneVisible={props.panelPrefs.cursorLaneVisible}
        telemetryLaneVisible={props.panelPrefs.telemetryLaneVisible}
        trackPanelPrefs={props.panelPrefs}
      />
    </ProjectTimelineSurface>
  );
}
