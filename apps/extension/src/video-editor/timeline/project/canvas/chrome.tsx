import { ProjectTimelinePlaybackRangeOverlay, ProjectTimelineRuler } from './parts/index';
import type { VideoEditorPlaybackRange } from '../../../interaction/playback/range';
import type { buildProjectTimelineRulerMarkers } from './render-data';

type ProjectTimelineRulerMarker = ReturnType<typeof buildProjectTimelineRulerMarkers>[number];

export function ProjectTimelineCanvasChrome(props: {
  playbackRange: VideoEditorPlaybackRange | null;
  pixelsPerSecond: number;
  rulerMarkers: ProjectTimelineRulerMarker[];
  onBeginRangeSelection: (event: React.PointerEvent<HTMLDivElement>) => void;
}) {
  return (
    <>
      <ProjectTimelineRuler
        onBeginRangeSelection={props.onBeginRangeSelection}
        playbackRange={props.playbackRange}
        pixelsPerSecond={props.pixelsPerSecond}
        rulerMarkers={props.rulerMarkers}
      />
      <ProjectTimelinePlaybackRangeOverlay
        pixelsPerSecond={props.pixelsPerSecond}
        playbackRange={props.playbackRange}
      />
    </>
  );
}
