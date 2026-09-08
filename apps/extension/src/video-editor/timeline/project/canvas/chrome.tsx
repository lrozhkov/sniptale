import type { TimelineProjection } from '../interaction-state/projection';
import { ProjectTimelinePlaybackRangeOverlay, ProjectTimelineRuler } from './parts/index';
import type { VideoEditorPlaybackRange } from '../../../interaction/playback/range';
import type { buildProjectTimelineRulerMarkers } from './render-data';

type ProjectTimelineRulerMarker = ReturnType<typeof buildProjectTimelineRulerMarkers>[number];

export function ProjectTimelineCanvasChrome(props: {
  playheadHandle: React.ReactNode;
  playbackRange: VideoEditorPlaybackRange | null;
  pixelsPerSecond: number;
  projection?: TimelineProjection | undefined;
  rulerMarkers: ProjectTimelineRulerMarker[];
  onBeginRangeSelection: (event: React.PointerEvent<HTMLDivElement>) => void;
}) {
  return (
    <>
      <ProjectTimelineRuler
        onBeginRangeSelection={props.onBeginRangeSelection}
        playbackRange={props.playbackRange}
        pixelsPerSecond={props.pixelsPerSecond}
        projection={props.projection}
        rulerMarkers={props.rulerMarkers}
      >
        {props.playheadHandle}
      </ProjectTimelineRuler>
      <ProjectTimelinePlaybackRangeOverlay
        pixelsPerSecond={props.pixelsPerSecond}
        projection={props.projection}
        playbackRange={props.playbackRange}
      />
    </>
  );
}
