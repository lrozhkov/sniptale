import type { RecordingTelemetryEntry } from '../../../composition/persistence/recordings/contracts';
import type { VideoProject } from '../../../features/video/project/types/index';
import type { VideoEditorSaveState } from '../session-state';
import type {
  VideoEditorTypingSpanTarget,
  VideoEditorTypingCompressionRequest,
  VideoEditorTypingCompressionResult,
} from './timeline';

export interface VideoEditorSessionActions {
  setProject: (project: VideoProject, recordingId?: string | null) => void;
  updateProject: (updater: (project: VideoProject) => VideoProject) => void;
  syncProjectRevision: (expectedProject: VideoProject, persistedUpdatedAt: number) => void;
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
  selectActionOccurrence: (eventId: string, clipId: string | null) => void;
  selectHistoryLane: () => void;
  selectHistorySpan: (target: VideoEditorTypingSpanTarget) => void;
  applyTypingCompression: (
    request: VideoEditorTypingCompressionRequest,
    expectedProject: VideoProject
  ) => VideoEditorTypingCompressionResult;
  selectMotionLane: () => void;
  selectMotionRegion: (motionRegionId: string, part?: 'connection') => void;
  startActionPointPlacement: (eventId: string, clipId: string | null) => void;
  startMotionFocusPlacement: (motionRegionId: string) => void;
  startMotionAreaPlacement: (motionRegionId: string) => void;

  setRecordingTelemetry: (recordingTelemetry: readonly RecordingTelemetryEntry[]) => void;
}
