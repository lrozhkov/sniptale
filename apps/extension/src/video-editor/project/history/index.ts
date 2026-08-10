import { applyVideoProjectMutationPatch } from '../../../features/video/project/mutation';
import type { VideoProject } from '../../../features/video/project/types';
import type { VideoEditorProjectHistoryError } from '../../contracts/commands/history';

/** Maximum number of project-edit actions retained for undo in the active editor session. */
export const VIDEO_EDITOR_PROJECT_HISTORY_ACTION_LIMIT = 100;

export interface VideoEditorProjectHistoryState {
  projectId: string | null;
  past: VideoProject[];
  future: VideoProject[];
  error: VideoEditorProjectHistoryError | null;
}

type VideoEditorProjectHistoryTransition =
  | { status: 'applied'; history: VideoEditorProjectHistoryState; project: VideoProject }
  | { status: 'failed'; history: VideoEditorProjectHistoryState };

export function createEmptyVideoEditorProjectHistory(): VideoEditorProjectHistoryState {
  return { projectId: null, past: [], future: [], error: null };
}

export function resetVideoEditorProjectHistory(projectId: string): VideoEditorProjectHistoryState {
  return { projectId, past: [], future: [], error: null };
}

export function recordVideoEditorProjectHistory(
  history: VideoEditorProjectHistoryState,
  currentProject: VideoProject,
  nextProject: VideoProject
): VideoEditorProjectHistoryState {
  if (currentProject.id !== nextProject.id || history.projectId !== currentProject.id) {
    return failedHistory(nextProject.id, 'projectMismatch');
  }

  try {
    return {
      projectId: currentProject.id,
      past: [...history.past, structuredClone(currentProject)].slice(
        -VIDEO_EDITOR_PROJECT_HISTORY_ACTION_LIMIT
      ),
      future: [],
      error: null,
    };
  } catch {
    return failedHistory(nextProject.id, 'snapshotFailed');
  }
}

export function undoVideoEditorProjectHistory(
  history: VideoEditorProjectHistoryState,
  currentProject: VideoProject
): VideoEditorProjectHistoryTransition | null {
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
  return { projectId, past: [], future: [], error };
}
