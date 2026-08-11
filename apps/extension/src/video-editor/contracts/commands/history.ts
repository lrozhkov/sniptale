export type VideoEditorProjectHistoryError = 'projectMismatch' | 'snapshotFailed';
export type VideoEditorProjectHistoryTransactionLease = symbol;

export interface VideoEditorProjectHistoryActions {
  beginProjectHistoryTransaction: () => VideoEditorProjectHistoryTransactionLease | null;
  endProjectHistoryTransaction: (lease: VideoEditorProjectHistoryTransactionLease) => void;
  isProjectHistoryTransactionCurrent: (lease: VideoEditorProjectHistoryTransactionLease) => boolean;
  undoProject: () => void;
  redoProject: () => void;
}

export type VideoEditorProjectHistoryTransactionActions = Pick<
  VideoEditorProjectHistoryActions,
  | 'beginProjectHistoryTransaction'
  | 'endProjectHistoryTransaction'
  | 'isProjectHistoryTransactionCurrent'
>;

export interface VideoEditorProjectHistoryStatus {
  canUndo: boolean;
  canRedo: boolean;
  error: VideoEditorProjectHistoryError | null;
}

export type VideoEditorProjectHistoryController = VideoEditorProjectHistoryStatus & {
  onUndo: () => void;
  onRedo: () => void;
};
