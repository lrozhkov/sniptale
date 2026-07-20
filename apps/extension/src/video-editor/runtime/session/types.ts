import type {
  VideoProject,
  VideoProjectActionEvent,
  VideoProjectMotionRegion,
} from '../../../features/video/project/types/index';
import type { VideoEditorLibrariesState } from '../app-model/types';
import type { VideoEditorExportActions } from '../../contracts/commands/export';
import type { VideoEditorProjectActions } from '../../contracts/commands/project';
import type { VideoEditorSessionActions } from '../../contracts/commands/session';
import type { VideoEditorPlacementMode } from '../../contracts/placement';
import type { VideoEditorSelection } from '../../contracts/selection';
import type { VideoEditorPlaybackRange } from '../../interaction/playback/range';

export type ApplyLoadedProject = (project: VideoProject, recordingId: string | null) => void;

export interface UseVideoEditorRuntimeParams {
  project: VideoProject | null;
  recordingId: string | null;
  pixelsPerSecond: number;
  playback: {
    currentTime: number;
    isPlaying: boolean;
    playbackRange: VideoEditorPlaybackRange | null;
    placementMode: VideoEditorPlacementMode | null;
    selection: VideoEditorSelection;
    selectedActionEvent: VideoProjectActionEvent | null;
    selectedClipId: string | null;
    selectedMotionRegion: VideoProjectMotionRegion | null;
    deleteSelection: {
      actionEvent: VideoEditorProjectActions['deleteActionEvent'];
      clip: VideoEditorProjectActions['deleteClip'];
      cursorSample: VideoEditorProjectActions['deleteCursorSample'];
      motionRegion: VideoEditorProjectActions['deleteMotionRegion'];
      objectTrack: VideoEditorProjectActions['deleteObjectTrack'];
    };
    clearPlacementMode: VideoEditorSessionActions['clearPlacementMode'];
    setCurrentTime: VideoEditorSessionActions['setCurrentTime'];
    setPlaying: VideoEditorSessionActions['setPlaying'];
    splitClipAt: VideoEditorProjectActions['splitClipAt'];
    updateActionEventDetails: VideoEditorProjectActions['updateActionEventDetails'];
    updateClipTransform: VideoEditorProjectActions['updateClipTransform'];
    updateMotionRegion: VideoEditorProjectActions['updateMotionRegion'];
  };
  projectState: {
    setProject: VideoEditorSessionActions['setProject'];
    updateProject: VideoEditorSessionActions['updateProject'];
    setReady: VideoEditorSessionActions['setReady'];
    setError: VideoEditorSessionActions['setError'];
    setSaveState: VideoEditorSessionActions['setSaveState'];
    setDiagnosticsOpen: VideoEditorSessionActions['setDiagnosticsOpen'];
  };
  exportState: {
    getActiveJobId: () => string | null;
    updateExportStatus: VideoEditorExportActions['updateExportStatus'];
    failExport: VideoEditorExportActions['failExport'];
    completeExport: VideoEditorExportActions['completeExport'];
    cancelExport: VideoEditorExportActions['cancelExport'];
  };
  libraries: VideoEditorLibrariesState;
}
