import { useCallback, useReducer } from 'react';
import {
  applyGuideStructureOperation,
  type GuideStructureOperation,
} from '../../../features/scenario/project/public';
import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import {
  EDITOR_HISTORY_LIMITS,
  selectEditorSnapshotWindow,
} from '../../../features/editor-history/policy';

const HISTORY_LIMIT = EDITOR_HISTORY_LIMITS.maxActions;
/** Page-local disposable undo state; persisted revisions remain owned by scenario persistence. */
export interface GuideHistory {
  present: GuideProject | null;
  past: GuideProject[];
  future: GuideProject[];
  group: string | null;
  historyNavigation?: true;
  actionId?: string;
  closedCaptures?: readonly GuideHistoryCapture[];
}

/** A final page-owned group value awaits the same ordinary CAS writer as current content. */
export interface GuideHistoryCapture {
  project: GuideProject;
  actionId: string;
}
const NO_CLOSED_CAPTURES: readonly GuideHistoryCapture[] = Object.freeze([]);

function closeGuideCapture(state: GuideHistory, explicitSeal = false): GuideHistory {
  if (!state.present || !state.actionId || (state.historyNavigation && !explicitSeal)) return state;
  const captures = state.closedCaptures ?? NO_CLOSED_CAPTURES;
  const capture = { project: state.present, actionId: state.actionId };
  return {
    ...state,
    closedCaptures:
      captures.at(-1)?.actionId === state.actionId
        ? [...captures.slice(0, -1), capture]
        : [...captures, capture],
  };
}

function guideActionIdentity(state: GuideHistory, actionId?: string): GuideHistory {
  const { actionId: _previous, historyNavigation: _navigation, ...rest } = state;
  return { ...rest, ...(actionId ? { actionId } : {}) };
}

function retainGuideHistory(state: GuideHistory): GuideHistory {
  if (!state.present) return state;
  const snapshots = [...state.past, state.present, ...state.future];
  const window = selectEditorSnapshotWindow(snapshots, state.past.length);
  const past = window.start === 0 ? state.past : snapshots.slice(window.start, state.past.length);
  const future =
    window.end === snapshots.length - 1
      ? state.future
      : snapshots.slice(state.past.length + 1, window.end + 1);
  const retained = new Set([...past, state.present, ...future]);
  const captures = state.closedCaptures?.filter(
    (capture) => retained.has(capture.project) || capture.actionId === state.actionId
  );
  const closedCaptures =
    captures?.length === state.closedCaptures?.length ? state.closedCaptures : captures;
  if (past === state.past && future === state.future && closedCaptures === state.closedCaptures)
    return state;
  return { ...state, past, future, ...(closedCaptures ? { closedCaptures } : {}) };
}
type HistoryAction =
  | { kind: 'reset'; project: GuideProject | null; past?: GuideProject[] }
  | { kind: 'commit'; project: GuideProject; reversible?: true }
  | { kind: 'publish'; project: GuideProject; source: GuideProject; actionId?: string }
  | { kind: 'edit'; project: GuideProject; group: string | null; actionId?: string }
  | { kind: 'undo'; actionId?: string }
  | { kind: 'redo'; actionId?: string }
  | { kind: 'seal' };

/** Keeps equivalent serialized items stable while adopting the canonical published values. */
function reusePublishedGuideItems(project: GuideProject, source: GuideProject): GuideProject {
  const items = project.items.map((item, index) => {
    const previous = source.items[index];
    return previous?.id === item.id && JSON.stringify(previous) === JSON.stringify(item)
      ? previous
      : item;
  });
  const unchanged =
    items.length === source.items.length &&
    items.every((item, index) => item === source.items[index]);
  return { ...project, items: unchanged ? source.items : items };
}

/** One reducer owns the current buffer and both directions of reversible edits. */
export function reduceGuideHistory(state: GuideHistory, action: HistoryAction): GuideHistory {
  if (action.kind === 'reset')
    return retainGuideHistory({
      present: action.project,
      past: (action.past ?? [])
        .filter((project) => project.id === action.project?.id)
        .slice(-HISTORY_LIMIT),
      future: [],
      group: null,
    });
  if (action.kind === 'seal') return { ...closeGuideCapture(state, true), group: null };
  if (!state.present) return state;
  if (action.kind === 'undo') {
    const previous = state.past.at(-1);
    return previous
      ? retainGuideHistory({
          ...guideActionIdentity(
            {
              ...closeGuideCapture(state),
              present: previous,
              past: state.past.slice(0, -1),
              future: [state.present, ...state.future],
              group: null,
            },
            action.actionId
          ),
          historyNavigation: true,
        })
      : state;
  }
  if (action.kind === 'redo') {
    const next = state.future[0];
    return next
      ? retainGuideHistory({
          ...guideActionIdentity(
            {
              ...closeGuideCapture(state),
              present: next,
              past: [...state.past, state.present].slice(-HISTORY_LIMIT),
              future: state.future.slice(1),
              group: null,
            },
            action.actionId
          ),
          historyNavigation: true,
        })
      : state;
  }
  if (action.project.id !== state.present.id) return state;
  if (action.kind === 'publish') {
    const present =
      state.present === action.source
        ? reusePublishedGuideItems(action.project, action.source)
        : { ...state.present, updatedAt: action.project.updatedAt };
    const closedCaptures = state.closedCaptures?.filter(
      (capture) =>
        capture.project !== action.source ||
        (action.actionId !== undefined && capture.actionId !== action.actionId)
    );
    return retainGuideHistory({ ...state, present, ...(closedCaptures ? { closedCaptures } : {}) });
  }
  if (action.kind === 'commit')
    return retainGuideHistory(
      guideActionIdentity({
        ...state,
        present: action.project,
        group: null,
        closedCaptures: [],
        ...(action.reversible ? { past: [...state.past, state.present], future: [] } : {}),
      })
    );
  if (action.project === state.present) return state;
  const grouped =
    action.group !== null &&
    action.group === state.group &&
    state.past.length > 0 &&
    state.future.length === 0;
  return retainGuideHistory(
    guideActionIdentity(
      {
        ...(grouped ? state : closeGuideCapture(state)),
        present: action.project,
        past: grouped ? state.past : [...state.past, state.present].slice(-HISTORY_LIMIT),
        future: [],
        group: action.group,
      },
      grouped ? state.actionId : action.actionId
    )
  );
}

/** React adapter for this page's single disposable guide buffer. */
export function useGuideHistory({
  canEdit,
  onEdit,
  onFailure,
}: {
  canEdit: () => boolean;
  onEdit: () => void;
  onFailure: () => void;
}) {
  const [state, dispatch] = useReducer(reduceGuideHistory, {
    present: null,
    past: [],
    future: [],
    group: null,
  });
  const reset = useCallback(
    (project: GuideProject | null, past: GuideProject[] = []) =>
      dispatch({ kind: 'reset', project, past }),
    []
  );
  const edit = (project: GuideProject, group: string | null = null) => {
    if (!canEdit() || !state.present || project.id !== state.present.id) return;
    dispatch({ kind: 'edit', project, group, actionId: crypto.randomUUID() });
    onEdit();
  };
  const changeHistory = (kind: 'undo' | 'redo') => {
    if (!canEdit() || (kind === 'undo' ? state.past.length : state.future.length) === 0) return;
    dispatch({ kind, actionId: crypto.randomUUID() });
    onEdit();
  };
  const operate = (operation: GuideStructureOperation) => {
    if (!canEdit() || !state.present) return;
    try {
      const next = applyGuideStructureOperation(state.present, operation);
      edit(next);
      return next;
    } catch {
      onFailure();
    }
  };
  return {
    project: state.present,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    actionId: state.actionId,
    closedCaptures: state.closedCaptures ?? NO_CLOSED_CAPTURES,
    reset,
    commit: (project: GuideProject, reversible = false) =>
      dispatch({ kind: 'commit', project, ...(reversible ? { reversible: true } : {}) }),
    publish: (project: GuideProject, source: GuideProject, actionId?: string) =>
      dispatch({ kind: 'publish', project, source, ...(actionId ? { actionId } : {}) }),
    update: edit,
    operate,
    undo: () => changeHistory('undo'),
    redo: () => changeHistory('redo'),
    sealEdit: () => dispatch({ kind: 'seal' }),
  };
}
