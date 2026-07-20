import type { RecordingTelemetryEntry } from '../../../composition/persistence/recordings/contracts';
import type { VideoProject } from '../../../features/video/project/types/index';
import type { VideoEditorSaveState } from '../session-state';

export interface VideoEditorSessionActions {
  setProject: (project: VideoProject, recordingId?: string | null) => void;
  updateProject: (updater: (project: VideoProject) => VideoProject) => void;
  setReady: (ready: boolean) => void;
  setError: (error: string | null) => void;
  setSaveState: (state: VideoEditorSaveState) => void;
  setCurrentTime: (time: number) => void;
  setPlaying: (playing: boolean) => void;
  togglePlaying: () => void;
  setPixelsPerSecond: (pixelsPerSecond: number) => void;
  clearPlacementMode: () => void;
  selectScene: () => void;
  selectTrack: (trackId: string | null) => void;
  selectClip: (clipId: string | null) => void;
  selectTransition: (transitionId: string) => void;
  selectCursorSegment: (sampleId: string) => void;
  selectObjectTrack: (objectTrackId: string) => void;
  selectActionSegment: (actionEventId: string) => void;
  selectMotionRegion: (motionRegionId: string) => void;
  startActionPointPlacement: (actionEventId: string) => void;
  startMotionFocusPlacement: (motionRegionId: string) => void;
  startMotionAreaPlacement: (motionRegionId: string) => void;
  startMotionPathStopAreaPlacement: (motionRegionId: string, stopId: string) => void;
  startMotionPathStopPointPlacement: (motionRegionId: string, stopId: string) => void;
  setDiagnosticsOpen: (open: boolean) => void;
  setRecordingTelemetry: (recordingTelemetry: RecordingTelemetryEntry | null) => void;
  toggleTelemetryLaneVisibility: () => void;
}
