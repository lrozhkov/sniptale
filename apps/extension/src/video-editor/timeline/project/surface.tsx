import { FloatingChromePanel } from '@sniptale/ui/floating-chrome';
import { ProjectTimelineToolbar } from './toolbar';
import type { ProjectTimelineProps } from './types';
import type { useProjectTimelinePanelPrefs } from './panel/prefs';
import type { useProjectTimelineState } from './interaction-state/index';

type ProjectTimelineSurfaceProps = Pick<
  ProjectTimelineProps & ReturnType<typeof useProjectTimelineState>,
  | 'currentTime'
  | 'fitSelectionDuration'
  | 'insertion'
  | 'isPlaying'
  | 'onClearPlaybackRange'
  | 'onAutoTransformRecording'
  | 'onDeleteSelectedClip'
  | 'onDuplicateSelectedClip'
  | 'onFitProject'
  | 'onFitSelection'
  | 'onSeekToStart'
  | 'onSplitSelectedClip'
  | 'onTimelinePreviewSuspendedChange'
  | 'onTogglePlay'
  | 'onZoomChange'
  | 'playbackRange'
  | 'pixelsPerSecond'
  | 'project'
  | 'selectedClip'
  | 'visibleRangeSeconds'
> & {
  children: React.ReactNode;
  panelPrefs: ReturnType<typeof useProjectTimelinePanelPrefs>;
};

export function ProjectTimelineSurface(props: ProjectTimelineSurfaceProps) {
  return (
    <FloatingChromePanel
      dataUi="video-editor.timeline.surface"
      className={[
        'flex h-full min-h-0 flex-col overflow-hidden rounded-[12px] p-0',
        'backdrop-blur-[10px]',
      ].join(' ')}
    >
      <ProjectTimelineToolbar
        currentTime={props.currentTime}
        duration={props.project.duration}
        fitSelectionDuration={props.fitSelectionDuration}
        insertion={props.insertion}
        isPlaying={props.isPlaying}
        pixelsPerSecond={props.pixelsPerSecond}
        playbackRange={props.playbackRange}
        selectedClip={Boolean(props.selectedClip)}
        trackView={{
          compactRows: props.panelPrefs.prefs.compactRows,
          panelExpanded: props.panelPrefs.prefs.panelExpanded,
          onCompactRowsChange: props.panelPrefs.setCompactRows,
          onPanelExpandedChange: props.panelPrefs.setPanelExpanded,
        }}
        visibleRangeSeconds={props.visibleRangeSeconds}
        canAutoTransformRecording={props.project.baseRecordingId !== null}
        onClearPlaybackRange={props.onClearPlaybackRange}
        onSeekToStart={props.onSeekToStart}
        onAutoTransformRecording={props.onAutoTransformRecording}
        onFitProject={props.onFitProject}
        onFitSelection={props.onFitSelection}
        onTimelinePreviewSuspendedChange={props.onTimelinePreviewSuspendedChange}
        onZoomChange={props.onZoomChange}
        onTogglePlay={props.onTogglePlay}
        onSplitSelectedClip={props.onSplitSelectedClip}
        onDuplicateSelectedClip={props.onDuplicateSelectedClip}
        onDeleteSelectedClip={props.onDeleteSelectedClip}
      />
      {props.children}
    </FloatingChromePanel>
  );
}
