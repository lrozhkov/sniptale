import { createContext, useContext, type ReactNode } from 'react';
import { useVideoEditorTimelineController } from '../../runtime/controller/composition/hooks';
import { useProjectTimelinePanelPrefs } from '../../timeline/project/panel/prefs';
import { getSortedTracks } from '../../../features/video/project/timeline';
import { isVideoEditorPresentedTrack } from '../../project/operations/presented-tracks';

type TimelineController = NonNullable<ReturnType<typeof useVideoEditorTimelineController>>;
const TrackPresentationContext = createContext<{
  panelPrefs: ReturnType<typeof useProjectTimelinePanelPrefs>;
  tracks: TimelineController['state']['project']['tracks'];
  onMoveTrack: TimelineController['actions']['onMoveTrack'];
} | null>(null);

/** One per-project presentation owner serves the timeline and its track inspector. */
export function WorkspaceTrackPresentation({ children }: { children: ReactNode }) {
  const controller = useVideoEditorTimelineController();
  if (!controller) return children;
  return (
    <ProjectTrackPresentation key={controller.state.project.id} controller={controller}>
      {children}
    </ProjectTrackPresentation>
  );
}

function ProjectTrackPresentation({
  controller,
  children,
}: {
  controller: TimelineController;
  children: ReactNode;
}) {
  const panelPrefs = useProjectTimelinePanelPrefs(controller.state.project);
  return (
    <TrackPresentationContext.Provider
      value={{
        panelPrefs,
        tracks: getSortedTracks(controller.state.project).filter(isVideoEditorPresentedTrack),
        onMoveTrack: controller.actions.onMoveTrack,
      }}
    >
      {children}
    </TrackPresentationContext.Provider>
  );
}

export function useWorkspaceTrackPresentation() {
  return useContext(TrackPresentationContext);
}
