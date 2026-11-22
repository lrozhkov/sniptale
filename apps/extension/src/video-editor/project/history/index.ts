import {
  collectVideoProjectHistorySources,
  type VideoProjectHistoryCapture,
  type RestoredVideoProjectHistory,
  type RestoredVideoProjectHistoryValue,
  type VideoProjectHistorySourceReference,
} from '../../../features/video/project/history-capture';
import { selectHistoryRetentionWindow } from '@sniptale/foundation/history/retention';
import type { VideoEditorSelection } from '../../contracts/selection';
import type { VideoProject } from '../../../features/video/project/types';
import type {
  VideoEditorProjectHistoryError,
  VideoEditorProjectHistoryTransactionLease,
  VideoEditorProjectHistoryTransactionOutcome,
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
  sources: readonly VideoProjectHistorySourceReference[];
}
const entryEncoding = new WeakMap<
  VideoEditorHistoryEntry,
  { value: string; valueBytes: number; bytes: number }
>();

function encodeEntry(entry: VideoEditorHistoryEntry): {
  value: string;
  valueBytes: number;
  bytes: number;
} {
  const cached = entryEncoding.get(entry);
  if (cached) return cached;
  const value = JSON.stringify(entry.change);
  const metadata = JSON.stringify({ projectId: entry.projectId, selection: entry.selection });
  const characters = value.length + metadata.length + 10;
  const valueBytes =
    value.length > EDITOR_HISTORY_LIMITS.maxBytes
      ? EDITOR_HISTORY_LIMITS.maxBytes + 1
      : new TextEncoder().encode(value).byteLength;
  const bytes =
    characters > EDITOR_HISTORY_LIMITS.maxBytes
      ? EDITOR_HISTORY_LIMITS.maxBytes + 1
      : valueBytes + new TextEncoder().encode(metadata).byteLength + 10;
  const encoded = { value, valueBytes, bytes };
  entryEncoding.set(entry, encoded);
  return encoded;
}

function measureEntry(entry: VideoEditorHistoryEntry): number {
  return encodeEntry(entry).bytes;
}

/** Captures encoded values without traversing retained payloads or persisting disposable UI state. */
export function captureVideoEditorProjectHistory(
  history: VideoEditorProjectHistoryState,
  currentProject?: VideoProject
): VideoProjectHistoryCapture | null {
  if (
    !history.projectId ||
    history.error ||
    (currentProject && currentProject.id !== history.projectId)
  )
    return null;
  const capture = (entry: VideoEditorHistoryEntry) =>
    Object.freeze({
      value: encodeEntry(entry).value,
      bytes: encodeEntry(entry).valueBytes,
      sources: entry.sources,
    });
  const base = Object.freeze({
    version: 1,
    epoch: history.epoch,
    past: Object.freeze(history.past.map(capture)),
    future: Object.freeze(history.future.map(capture)),
  });
  const transaction = history.transaction;
  if (!transaction) return base;
  if (!currentProject || !transaction.before || transaction.projectId !== currentProject.id)
    return null;
  if (!transaction.changed) return base;
  try {
    const change = createVideoProjectHistoryChange(transaction.before.project, currentProject);
    if (!change) return base;
    const recovery = capture({
      projectId: currentProject.id,
      change,
      selection: transaction.before.selection,
      sources: transaction.before.sources,
    });
    const entries = [...base.past, recovery, ...base.future];
    const window = selectHistoryRetentionWindow(
      entries.map((entry) => ({ actions: 1, bytes: entry.bytes })),
      base.past.length + 1,
      EDITOR_HISTORY_LIMITS
    );
    if (window.start > base.past.length || window.end <= base.past.length)
      return Object.freeze({ ...base, past: Object.freeze([]), future: Object.freeze([]) });
    return Object.freeze({
      ...base,
      past: Object.freeze(base.past.slice(window.start)),
      future: Object.freeze(base.future.slice(0, window.end - base.past.length - 1)),
      recovery,
    });
  } catch {
    return null;
  }
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
    const { sources, ...content } = captured;
    const owned = { ...structuredClone(content), sources };
    entryEncoding.set(owned, encodeEntry(captured));
    retained[retained.indexOf(captured)] = owned;
  }
  return {
    ...history,
    past: retained.slice(0, window.cursor),
    future: retained.slice(window.cursor),
  };
}

export interface VideoEditorProjectHistoryState {
  epoch: string;
  projectId: string | null;
  past: VideoEditorHistoryEntry[];
  future: VideoEditorHistoryEntry[];
  error: VideoEditorProjectHistoryError | null;
  transaction: VideoEditorProjectHistoryTransaction | null;
}

interface VideoEditorProjectHistoryTransaction {
  before: {
    project: VideoProject;
    selection: VideoEditorSelection;
    sources: readonly VideoProjectHistorySourceReference[];
  } | null;
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
  return {
    epoch: crypto.randomUUID(),
    projectId: null,
    past: [],
    future: [],
    error: null,
    transaction: null,
  };
}

export function resetVideoEditorProjectHistory(projectId: string): VideoEditorProjectHistoryState {
  return {
    epoch: crypto.randomUUID(),
    projectId,
    past: [],
    future: [],
    error: null,
    transaction: null,
  };
}

/** Adopt admitted inverses without encoding their payloads again. A recovered draft starts a branch. */
export function restoreVideoEditorProjectHistory(
  projectId: string,
  restored: RestoredVideoProjectHistory
): VideoEditorProjectHistoryState {
  if (restored.projectId !== projectId) return failedHistory(projectId, 'projectMismatch');
  const adopt = (value: RestoredVideoProjectHistoryValue): VideoEditorHistoryEntry => {
    const entry: VideoEditorHistoryEntry = {
      projectId,
      change: value.change,
      selection: { kind: 'scene' },
      sources: value.sources,
    };
    const metadata = JSON.stringify({ projectId, selection: entry.selection });
    entryEncoding.set(entry, {
      value: value.value,
      valueBytes: value.bytes,
      bytes: value.bytes + new TextEncoder().encode(metadata).byteLength + 10,
    });
    return entry;
  };
  const past = restored.past.map(adopt);
  if (restored.recovery) past.push(adopt(restored.recovery));
  const future = restored.recovery ? [] : restored.future.map(adopt);
  const entries = [...past, ...future];
  const window = selectHistoryRetentionWindow(
    entries.map((entry) => ({ actions: 1, bytes: measureEntry(entry) })),
    past.length,
    EDITOR_HISTORY_LIMITS
  );
  return {
    projectId,
    epoch: restored.epoch,
    past: entries.slice(window.start, window.start + window.cursor),
    future: entries.slice(window.start + window.cursor, window.end),
    transaction: null,
    error: null,
  };
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
        before: { ...before, sources: collectVideoProjectHistorySources(before.project) },
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
  currentProject: VideoProject,
  outcome: VideoEditorProjectHistoryTransactionOutcome = 'commit'
): VideoEditorProjectHistoryState {
  const transaction = history.transaction;
  if (!transaction) return history;
  if (history.projectId !== currentProject.id || transaction.projectId !== currentProject.id)
    return failedHistory(currentProject.id, 'projectMismatch');
  const closed = { ...history, transaction: null };
  if (outcome === 'cancel' || !transaction.changed || !transaction.before) return closed;
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
    const before = {
      projectId: currentProject.id,
      change,
      selection,
      sources: collectVideoProjectHistorySources(currentProject),
    };
    return retainProjectHistory(
      {
        epoch: history.epoch,
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
    const inverse = {
      projectId: currentProject.id,
      change,
      selection,
      sources: collectVideoProjectHistorySources(currentProject),
    };
    return {
      status: 'applied',
      history: retainProjectHistory(
        {
          epoch: history.epoch,
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
  return { epoch: crypto.randomUUID(), projectId, past: [], future: [], error, transaction: null };
}
