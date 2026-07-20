import { useCallback, useState } from 'react';
import { useVideoEditorAssetUrls } from './asset-urls';
import { useVideoEditorPlayback } from './playback';
import type { ApplyLoadedProject, UseVideoEditorRuntimeParams } from './types';
import { createApplyLoadedProject, useVideoEditorRuntimeEffects } from './effects';
import type { PlaybackPreviewRuntime } from '../../interaction/playback/types';
import { useTimelineClipPreviews } from './timeline-previews';
import type {
  TimelineClipPreviewMap,
  TimelinePreviewViewport,
} from '../../contracts/timeline-preview';

export interface VideoEditorRuntimeController {
  assetUrls: Record<string, string>;
  timelinePreviews: TimelineClipPreviewMap;
  setTimelinePreviewSuspended: (suspended: boolean) => void;
  setTimelinePreviewViewport: (viewport: TimelinePreviewViewport) => void;
  registerPreviewRuntime: (runtime: PlaybackPreviewRuntime | null) => void;
  pausePlayback: () => number;
  seekTo: (time: number) => void;
  setPlaybackPlaying: (playing: boolean) => void;
  togglePlayback: () => void;
  applyLoadedProject: ApplyLoadedProject;
}

function createVideoEditorRuntimeController(
  assetUrls: Record<string, string>,
  timelinePreviews: TimelineClipPreviewMap,
  setTimelinePreviewSuspended: (suspended: boolean) => void,
  setTimelinePreviewViewport: (viewport: TimelinePreviewViewport) => void,
  applyLoadedProject: ApplyLoadedProject,
  playback: ReturnType<typeof useVideoEditorPlayback>
): VideoEditorRuntimeController {
  return {
    assetUrls,
    timelinePreviews,
    setTimelinePreviewSuspended,
    setTimelinePreviewViewport,
    registerPreviewRuntime: playback.registerPreviewRuntime,
    pausePlayback: playback.pausePlayback,
    seekTo: playback.seekTo,
    setPlaybackPlaying: playback.setPlaybackPlaying,
    togglePlayback: playback.togglePlayback,
    applyLoadedProject,
  };
}

function useApplyLoadedProject(
  setProject: UseVideoEditorRuntimeParams['projectState']['setProject'],
  setError: UseVideoEditorRuntimeParams['projectState']['setError'],
  setDiagnosticsOpen: UseVideoEditorRuntimeParams['projectState']['setDiagnosticsOpen']
) {
  return useCallback<ApplyLoadedProject>(
    (project, recordingId) =>
      createApplyLoadedProject(setProject, setError, setDiagnosticsOpen)(project, recordingId),
    [setDiagnosticsOpen, setError, setProject]
  );
}

function useVideoEditorRuntimeProjectEffects(
  params: UseVideoEditorRuntimeParams,
  applyLoadedProject: ApplyLoadedProject
) {
  useVideoEditorRuntimeEffects({
    project: params.project,
    recordingId: params.recordingId,
    getActiveExportJobId: params.exportState.getActiveJobId,
    setSaveState: params.projectState.setSaveState,
    syncProjectRevision: params.projectState.updateProject,
    libraries: params.libraries,
    setError: params.projectState.setError,
    setReady: params.projectState.setReady,
    applyLoadedProject,
    updateExportStatus: params.exportState.updateExportStatus,
    failExport: params.exportState.failExport,
    completeExport: params.exportState.completeExport,
    cancelExport: params.exportState.cancelExport,
  });
}

/**
 * Composes focused runtime hooks behind a small controller interface for the entrypoint.
 */
export function useVideoEditorRuntime(
  params: UseVideoEditorRuntimeParams
): VideoEditorRuntimeController {
  const assetUrls = useVideoEditorAssetUrls(params.project);
  const timelinePreviewRuntime = useTimelinePreviewRuntime(params.project, assetUrls);
  const applyLoadedProject = useApplyLoadedProject(
    params.projectState.setProject,
    params.projectState.setError,
    params.projectState.setDiagnosticsOpen
  );
  const playback = useVideoEditorPlayback(
    params.project,
    {
      currentTime: params.playback.currentTime,
      isPlaying: params.playback.isPlaying,
      playbackRange: params.playback.playbackRange,
      selection: params.playback.selection,
      placementMode: params.playback.placementMode,
      selectedClipId: params.playback.selectedClipId,
      selectedActionEvent: params.playback.selectedActionEvent,
      selectedMotionRegion: params.playback.selectedMotionRegion,
    },
    {
      setCurrentTime: params.playback.setCurrentTime,
      setPlaying: params.playback.setPlaying,
      splitClipAt: params.playback.splitClipAt,
      deleteClip: params.playback.deleteSelection.clip,
      deleteActionEvent: params.playback.deleteSelection.actionEvent,
      deleteCursorSample: params.playback.deleteSelection.cursorSample,
      deleteMotionRegion: params.playback.deleteSelection.motionRegion,
      deleteObjectTrack: params.playback.deleteSelection.objectTrack,
      clearPlacementMode: params.playback.clearPlacementMode,
      updateClipTransform: params.playback.updateClipTransform,
      updateActionEventDetails: params.playback.updateActionEventDetails,
      updateMotionRegion: params.playback.updateMotionRegion,
    }
  );

  useVideoEditorRuntimeProjectEffects(params, applyLoadedProject);

  return createVideoEditorRuntimeController(
    assetUrls,
    timelinePreviewRuntime.timelinePreviews,
    timelinePreviewRuntime.setTimelinePreviewSuspended,
    timelinePreviewRuntime.setTimelinePreviewViewport,
    applyLoadedProject,
    playback
  );
}

function useTimelinePreviewRuntime(
  project: UseVideoEditorRuntimeParams['project'],
  assetUrls: Record<string, string>
) {
  const [timelinePreviewViewport, setTimelinePreviewViewportState] =
    useState<TimelinePreviewViewport | null>(null);
  const [timelinePreviewSuspended, setTimelinePreviewSuspended] = useState(false);
  const setTimelinePreviewViewport = useCallback((viewport: TimelinePreviewViewport) => {
    setTimelinePreviewViewportState((current) =>
      current?.startTime === viewport.startTime && current.endTime === viewport.endTime
        ? current
        : viewport
    );
  }, []);
  const timelinePreviews = useTimelineClipPreviews(project, assetUrls, {
    suspended: timelinePreviewSuspended,
    viewport: timelinePreviewViewport,
  });
  return { setTimelinePreviewSuspended, setTimelinePreviewViewport, timelinePreviews };
}
