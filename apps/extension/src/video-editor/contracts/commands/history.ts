export type VideoEditorProjectHistoryError = 'projectMismatch' | 'snapshotFailed';
export type VideoEditorProjectHistoryTransactionLease = symbol;
export type VideoEditorProjectHistoryTransactionOutcome = 'commit' | 'cancel';

export interface VideoEditorProjectHistoryActions {
  beginProjectHistoryTransaction: (options?: {
    onlyIfIdle?: boolean;
  }) => VideoEditorProjectHistoryTransactionLease | null;
  /** Cancel restores the captured document while preserving the current selection and history cursor. */
  endProjectHistoryTransaction: (
    lease: VideoEditorProjectHistoryTransactionLease,
    outcome?: VideoEditorProjectHistoryTransactionOutcome
  ) => void;
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
