import { selectHistoryRetentionWindow } from '@sniptale/foundation/history/retention';
import type { VideoEditorSelection } from '../../contracts/selection';
import type { VideoProject } from '../../../features/video/project/types';
import type {
  VideoEditorProjectHistoryError,
  VideoEditorProjectHistoryTransactionLease,
} from '../../contracts/commands/history';
import { EDITOR_HISTORY_LIMITS } from '../../../features/editor-history/policy';
import {
  applyVideoProjectHistoryChange,
  createVideoProjectHistoryChange,
  type VideoProjectHistoryChange,
} from './project-change';

/** Maximum number of project-edit actions retained for undo in the active editor session. */
export const VIDEO_EDITOR_PROJECT_HISTORY_ACTION_LIMIT = EDITOR_HISTORY_LIMITS.maxActions;

interface VideoEditorHistoryEntry {
  projectId: string;
  change: VideoProjectHistoryChange;
  selection: VideoEditorSelection;
}
const entryBytes = new WeakMap<VideoEditorHistoryEntry, number>();

function measureEntry(entry: VideoEditorHistoryEntry): number {
  const cached = entryBytes.get(entry);
  if (cached !== undefined) return cached;
  const serialized = JSON.stringify(entry);
  const bytes =
    serialized.length > EDITOR_HISTORY_LIMITS.maxBytes
      ? EDITOR_HISTORY_LIMITS.maxBytes + 1
      : new TextEncoder().encode(serialized).byteLength;
  entryBytes.set(entry, bytes);
  return bytes;
}

/** Current content stays outside the operation budget. Clone a new change only if retained. */
function retainProjectHistory(
  history: VideoEditorProjectHistoryState,
  captured: VideoEditorHistoryEntry
): VideoEditorProjectHistoryState {
  const entries = [...history.past, ...history.future];
  const window = selectHistoryRetentionWindow(
    entries.map((entry) => ({ actions: 1, bytes: measureEntry(entry) })),
    history.past.length,
    EDITOR_HISTORY_LIMITS
  );
  const retained = entries.slice(window.start, window.end);
  if (retained.includes(captured)) {
    const owned = structuredClone(captured);
    entryBytes.set(owned, measureEntry(captured));
    retained[retained.indexOf(captured)] = owned;
  }
  return {
    ...history,
    past: retained.slice(0, window.cursor),
    future: retained.slice(window.cursor),
  };
}

export interface VideoEditorProjectHistoryState {
  projectId: string | null;
  past: VideoEditorHistoryEntry[];
  future: VideoEditorHistoryEntry[];
  error: VideoEditorProjectHistoryError | null;
  transaction: VideoEditorProjectHistoryTransaction | null;
}

interface VideoEditorProjectHistoryTransaction {
  before: { project: VideoProject; selection: VideoEditorSelection } | null;
  changed: boolean;
  lease: VideoEditorProjectHistoryTransactionLease;
  projectId: string;
}

type VideoEditorProjectHistoryTransition =
  | {
      status: 'applied';
      history: VideoEditorProjectHistoryState;
      project: VideoProject;
      selection: VideoEditorSelection;
    }
  | { status: 'failed'; history: VideoEditorProjectHistoryState };

export function createEmptyVideoEditorProjectHistory(): VideoEditorProjectHistoryState {
  return { projectId: null, past: [], future: [], error: null, transaction: null };
}

export function resetVideoEditorProjectHistory(projectId: string): VideoEditorProjectHistoryState {
  return { projectId, past: [], future: [], error: null, transaction: null };
}

export function beginVideoEditorProjectHistoryTransaction(
  history: VideoEditorProjectHistoryState,
  currentProject: VideoProject,
  selection: VideoEditorSelection = { kind: 'scene' }
): VideoEditorProjectHistoryState {
  if (history.transaction) return history;
  if (history.projectId !== currentProject.id)
    return failedHistory(currentProject.id, 'projectMismatch');
  try {
    const before = structuredClone({ project: currentProject, selection });
    // Blob bytes are immutable; keep their identity across the isolated transaction metadata.
    currentProject.effectSnapshots?.forEach((snapshot, index) => {
      snapshot.assets.forEach((asset, assetIndex) => {
        before.project.effectSnapshots![index]!.assets[assetIndex]!.blob = asset.blob;
      });
    });
    return {
      ...history,
      error: null,
      transaction: {
        before,
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
  if (history.projectId !== currentProject.id || transaction.projectId !== currentProject.id)
    return failedHistory(currentProject.id, 'projectMismatch');
  const closed = { ...history, transaction: null };
  if (!transaction.changed || !transaction.before) return closed;
  return recordVideoEditorProjectHistory(
    closed,
    transaction.before.project,
    currentProject,
    transaction.before.selection
  );
}

export function recordVideoEditorProjectHistory(
  history: VideoEditorProjectHistoryState,
  currentProject: VideoProject,
  nextProject: VideoProject,
  selection: VideoEditorSelection = { kind: 'scene' }
): VideoEditorProjectHistoryState {
  if (currentProject.id !== nextProject.id || history.projectId !== currentProject.id)
    return failedHistory(nextProject.id, 'projectMismatch');
  if (history.transaction) {
    if (history.transaction.projectId !== currentProject.id)
      return failedHistory(nextProject.id, 'projectMismatch');
    return history.transaction.changed
      ? history
      : { ...history, transaction: { ...history.transaction, changed: true } };
  }
  try {
    const change = createVideoProjectHistoryChange(currentProject, nextProject);
    if (!change) return history;
    const before = { projectId: currentProject.id, change, selection };
    return retainProjectHistory(
      {
        projectId: currentProject.id,
        past: [...history.past, before],
        future: [],
        error: null,
        transaction: null,
      },
      before
    );
  } catch {
    return failedHistory(nextProject.id, 'snapshotFailed');
  }
}

function moveProjectHistory(
  history: VideoEditorProjectHistoryState,
  currentProject: VideoProject,
  selection: VideoEditorSelection,
  direction: 'undo' | 'redo'
): VideoEditorProjectHistoryTransition | null {
  if (history.transaction) return null;
  const target = direction === 'undo' ? history.past.at(-1) : history.future[0];
  if (!target) return null;
  if (history.projectId !== currentProject.id || target.projectId !== currentProject.id)
    return { status: 'failed', history: failedHistory(currentProject.id, 'projectMismatch') };
  try {
    const project = applyVideoProjectHistoryChange(currentProject, target.change);
    const change = createVideoProjectHistoryChange(currentProject, project);
    if (!change) throw new Error('History change is empty.');
    const inverse = { projectId: currentProject.id, change, selection };
    return {
      status: 'applied',
      history: retainProjectHistory(
        {
          projectId: currentProject.id,
          past: direction === 'undo' ? history.past.slice(0, -1) : [...history.past, inverse],
          future: direction === 'undo' ? [inverse, ...history.future] : history.future.slice(1),
          error: null,
          transaction: null,
        },
        inverse
      ),
      project,
      selection: structuredClone(target.selection),
    };
  } catch {
    return { status: 'failed', history: failedHistory(currentProject.id, 'snapshotFailed') };
  }
}

export function undoVideoEditorProjectHistory(
  history: VideoEditorProjectHistoryState,
  currentProject: VideoProject,
  selection: VideoEditorSelection = { kind: 'scene' }
): VideoEditorProjectHistoryTransition | null {
  return moveProjectHistory(history, currentProject, selection, 'undo');
}

export function redoVideoEditorProjectHistory(
  history: VideoEditorProjectHistoryState,
  currentProject: VideoProject,
  selection: VideoEditorSelection = { kind: 'scene' }
): VideoEditorProjectHistoryTransition | null {
  return moveProjectHistory(history, currentProject, selection, 'redo');
}

function failedHistory(
  projectId: string,
  error: VideoEditorProjectHistoryError
): VideoEditorProjectHistoryState {
  return { projectId, past: [], future: [], error, transaction: null };
}
