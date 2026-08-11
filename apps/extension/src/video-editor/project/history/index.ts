import { applyVideoProjectMutationPatch } from '../../../features/video/project/mutation';
import type { VideoProject } from '../../../features/video/project/types';
import type {
  VideoEditorProjectHistoryError,
  VideoEditorProjectHistoryTransactionLease,
} from '../../contracts/commands/history';

/** Maximum number of project-edit actions retained for undo in the active editor session. */
export const VIDEO_EDITOR_PROJECT_HISTORY_ACTION_LIMIT = 100;

export interface VideoEditorProjectHistoryState {
  projectId: string | null;
  past: VideoProject[];
  future: VideoProject[];
  error: VideoEditorProjectHistoryError | null;
  transaction: VideoEditorProjectHistoryTransaction | null;
}

interface VideoEditorProjectHistoryTransaction {
  before: VideoProject | null;
  changed: boolean;
  lease: VideoEditorProjectHistoryTransactionLease;
  projectId: string;
}

type VideoEditorProjectHistoryTransition =
  | { status: 'applied'; history: VideoEditorProjectHistoryState; project: VideoProject }
  | { status: 'failed'; history: VideoEditorProjectHistoryState };

export function createEmptyVideoEditorProjectHistory(): VideoEditorProjectHistoryState {
  return { projectId: null, past: [], future: [], error: null, transaction: null };
}

export function resetVideoEditorProjectHistory(projectId: string): VideoEditorProjectHistoryState {
  return { projectId, past: [], future: [], error: null, transaction: null };
}

export function beginVideoEditorProjectHistoryTransaction(
  history: VideoEditorProjectHistoryState,
  currentProject: VideoProject
): VideoEditorProjectHistoryState {
  if (history.transaction) return history;
  if (history.projectId !== currentProject.id) {
    return failedHistory(currentProject.id, 'projectMismatch');
  }

  try {
    return {
      ...history,
      error: null,
      transaction: {
        before: structuredClone(currentProject),
        changed: false,
        lease: Symbol('video-editor-project-history-transaction'),
        projectId: currentProject.id,
      },
    };
  } catch {
    return failedHistory(currentProject.id, 'snapshotFailed');
  }
}

export function endVideoEditorProjectHistoryTransaction(
  history: VideoEditorProjectHistoryState,
  currentProject: VideoProject
): VideoEditorProjectHistoryState {
  const transaction = history.transaction;
  if (!transaction) return history;
  if (history.projectId !== currentProject.id || transaction.projectId !== currentProject.id) {
    return failedHistory(currentProject.id, 'projectMismatch');
  }
  if (!transaction.changed || !transaction.before) {
    return { ...history, transaction: null };
  }
  if (areVideoProjectsHistoryEquivalent(transaction.before, currentProject)) {
    return { ...history, transaction: null };
  }

  return {
    projectId: currentProject.id,
    past: [...history.past, transaction.before].slice(-VIDEO_EDITOR_PROJECT_HISTORY_ACTION_LIMIT),
    future: [],
    error: null,
    transaction: null,
  };
}

function areVideoProjectsHistoryEquivalent(left: VideoProject, right: VideoProject): boolean {
  const { updatedAt: _leftUpdatedAt, ...leftContent } = left;
  const { updatedAt: _rightUpdatedAt, ...rightContent } = right;
  return JSON.stringify(leftContent) === JSON.stringify(rightContent);
}

export function recordVideoEditorProjectHistory(
  history: VideoEditorProjectHistoryState,
  currentProject: VideoProject,
  nextProject: VideoProject
): VideoEditorProjectHistoryState {
  if (currentProject.id !== nextProject.id || history.projectId !== currentProject.id) {
    return failedHistory(nextProject.id, 'projectMismatch');
  }

  if (history.transaction) {
    if (history.transaction.projectId !== currentProject.id) {
      return failedHistory(nextProject.id, 'projectMismatch');
    }
    return history.transaction.changed
      ? history
      : { ...history, transaction: { ...history.transaction, changed: true } };
  }

  try {
    return {
      projectId: currentProject.id,
      past: [...history.past, structuredClone(currentProject)].slice(
        -VIDEO_EDITOR_PROJECT_HISTORY_ACTION_LIMIT
      ),
      future: [],
      error: null,
      transaction: null,
    };
  } catch {
    return failedHistory(nextProject.id, 'snapshotFailed');
  }
}

export function undoVideoEditorProjectHistory(
  history: VideoEditorProjectHistoryState,
  currentProject: VideoProject
): VideoEditorProjectHistoryTransition | null {
  if (history.transaction) return null;
  if (history.past.length === 0) return null;
  if (history.projectId !== currentProject.id) {
    return {
      status: 'failed',
      history: failedHistory(currentProject.id, 'projectMismatch'),
    };
  }

  const target = history.past.at(-1);
  if (!target || target.id !== currentProject.id) {
    return {
      status: 'failed',
      history: failedHistory(currentProject.id, 'projectMismatch'),
    };
  }

  try {
    return {
      status: 'applied',
      history: {
        projectId: currentProject.id,
        past: history.past.slice(0, -1),
        future: [structuredClone(currentProject), ...history.future],
        error: null,
        transaction: null,
      },
      project: applyVideoProjectMutationPatch(structuredClone(target), {}),
    };
  } catch {
    return { status: 'failed', history: failedHistory(currentProject.id, 'snapshotFailed') };
  }
}

export function redoVideoEditorProjectHistory(
  history: VideoEditorProjectHistoryState,
  currentProject: VideoProject
): VideoEditorProjectHistoryTransition | null {
  if (history.transaction) return null;
  if (history.future.length === 0) return null;
  if (history.projectId !== currentProject.id) {
    return {
      status: 'failed',
      history: failedHistory(currentProject.id, 'projectMismatch'),
    };
  }

  const [target, ...remainingFuture] = history.future;
  if (!target || target.id !== currentProject.id) {
    return {
      status: 'failed',
      history: failedHistory(currentProject.id, 'projectMismatch'),
    };
  }

  try {
    return {
      status: 'applied',
      history: {
        projectId: currentProject.id,
        past: [...history.past, structuredClone(currentProject)].slice(
          -VIDEO_EDITOR_PROJECT_HISTORY_ACTION_LIMIT
        ),
        future: remainingFuture,
        error: null,
        transaction: null,
      },
      project: applyVideoProjectMutationPatch(structuredClone(target), {}),
    };
  } catch {
    return { status: 'failed', history: failedHistory(currentProject.id, 'snapshotFailed') };
  }
}

function failedHistory(
  projectId: string,
  error: VideoEditorProjectHistoryError
): VideoEditorProjectHistoryState {
  return { projectId, past: [], future: [], error, transaction: null };
}
