import { createContext, useContext, type ReactNode } from 'react';
import {
  useVideoEditorProjectLifecyclePort,
  useVideoEditorTimelineEditingPort,
} from '../../runtime/controller/store';
import type { TimelineEditingPort } from '../../contracts/controller-store';
import type { VideoProject } from '../../../features/video/project/types';
import { useProjectTimelinePanelPrefs } from '../../timeline/project/panel/prefs';
import { getSortedTracks } from '../../../features/video/project/timeline';
import { isVideoEditorPresentedTrack } from '../../project/operations/presented-tracks';

const TrackPresentationContext = createContext<{
  panelPrefs: ReturnType<typeof useProjectTimelinePanelPrefs>;
  tracks: VideoProject['tracks'];
  onMoveTrack: TimelineEditingPort['moveTrack'];
} | null>(null);

/** One per-project presentation owner serves the timeline and its track inspector. */
export function WorkspaceTrackPresentation({ children }: { children: ReactNode }) {
  const project = useVideoEditorProjectLifecyclePort((port) => port.project);
  const moveTrack = useVideoEditorTimelineEditingPort((port) => port.moveTrack);
  if (!project) return children;
  return (
    <ProjectTrackPresentation key={project.id} project={project} onMoveTrack={moveTrack}>
      {children}
    </ProjectTrackPresentation>
  );
}

function ProjectTrackPresentation({
  project,
  onMoveTrack,
  children,
}: {
  project: VideoProject;
  onMoveTrack: TimelineEditingPort['moveTrack'];
  children: ReactNode;
}) {
  const panelPrefs = useProjectTimelinePanelPrefs(project);
  return (
    <TrackPresentationContext.Provider
      value={{
        panelPrefs,
        tracks: getSortedTracks(project).filter(isVideoEditorPresentedTrack),
        onMoveTrack,
      }}
    >
      {children}
    </TrackPresentationContext.Provider>
  );
}

export function useWorkspaceTrackPresentation() {
  return useContext(TrackPresentationContext);
}
