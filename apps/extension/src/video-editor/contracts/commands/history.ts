export type VideoEditorProjectHistoryError = 'projectMismatch' | 'snapshotFailed';

export interface VideoEditorProjectHistoryActions {
  undoProject: () => void;
  redoProject: () => void;
}

export interface VideoEditorProjectHistoryStatus {
  canUndo: boolean;
  canRedo: boolean;
  error: VideoEditorProjectHistoryError | null;
}

export type VideoEditorProjectHistoryController = VideoEditorProjectHistoryStatus & {
  onUndo: () => void;
  onRedo: () => void;
};
