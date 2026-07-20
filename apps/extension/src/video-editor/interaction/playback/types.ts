import type { VideoProject, VideoProjectClip } from '../../../features/video/project/types/index';
import type {
  VideoEditorActionEventPatch,
  VideoEditorMotionRegionPatch,
} from '../../contracts/commands/patches';
import type { VideoEditorSelection } from '../../contracts/selection';
import type { VideoEditorPlacementMode } from '../../contracts/placement';
import type { VideoEditorPlaybackRange } from './range';
import type { VideoEditorPreviewRuntimePort } from '../../contracts/preview-runtime';

export interface PlaybackRefState {
  startedAt: number;
  initialTime: number;
  sessionStart: number;
}

export type PlaybackPreviewRuntime = VideoEditorPreviewRuntimePort;

export interface PlaybackLatestState {
  currentTime: number;
  isPlaying: boolean;
  placementMode: VideoEditorPlacementMode | null;
  playbackRange: VideoEditorPlaybackRange | null;
  project: VideoProject | null;
  selection: VideoEditorSelection;
  selectedActionEvent: NonNullable<NonNullable<VideoProject['actionEvents']>[number]> | null;
  selectedClipId: string | null;
  selectedMotionRegion: NonNullable<NonNullable<VideoProject['motionRegions']>[number]> | null;
}

export interface PlaybackHandlers {
  clearPlacementMode: () => void;
  deleteActionEvent: (actionEventId: string) => void;
  deleteClip: (clipId: string) => void;
  deleteCursorSample: (sampleId: string) => void;
  deleteMotionRegion: (motionRegionId: string) => void;
  deleteObjectTrack: (objectTrackId: string) => void;
  setCurrentTime: (time: number) => void;
  setPlaying: (playing: boolean) => void;
  splitClipAt: (clipId: string, time: number) => void;
  updateActionEventDetails: (actionEventId: string, patch: VideoEditorActionEventPatch) => void;
  updateClipTransform: (clipId: string, patch: Partial<VideoProjectClip['transform']>) => void;
  updateMotionRegion: (motionRegionId: string, patch: VideoEditorMotionRegionPatch) => void;
}
