import { ProjectTimelineBody } from './body';
import { ProjectTimelineSurface } from './surface';
import type { ProjectTimelineProps } from './types';
import { useProjectTimelinePanelPrefs } from './panel/prefs';
import { useProjectTimelineState } from './interaction-state/index';

export const ProjectTimeline = (props: ProjectTimelineProps) => {
  const panelPrefs = useProjectTimelinePanelPrefs(props.project);
  const timelineState = useProjectTimelineState(props, panelPrefs.prefs.trackHeightByTrackId);

  return <ProjectTimelineLayout {...props} {...timelineState} panelPrefs={panelPrefs} />;
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
