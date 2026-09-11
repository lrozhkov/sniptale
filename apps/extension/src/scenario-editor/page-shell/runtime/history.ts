import { useCallback, useReducer } from 'react';
import {
  applyGuideStructureOperation,
  type GuideStructureOperation,
} from '../../../features/scenario/project/public';
import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';

const HISTORY_LIMIT = 50;
/** Page-local disposable undo state; persisted revisions remain owned by scenario persistence. */
export interface GuideHistory {
  present: GuideProject | null;
  past: GuideProject[];
  future: GuideProject[];
  group: string | null;
}
type HistoryAction =
  | { kind: 'reset'; project: GuideProject | null }
  | { kind: 'commit'; project: GuideProject }
  | { kind: 'edit'; project: GuideProject; group: string | null }
  | { kind: 'undo' }
  | { kind: 'redo' }
  | { kind: 'seal' };

/** One reducer owns the current buffer and both directions of reversible edits. */
export function reduceGuideHistory(state: GuideHistory, action: HistoryAction): GuideHistory {
  if (action.kind === 'reset')
    return { present: action.project, past: [], future: [], group: null };
  if (action.kind === 'seal') return { ...state, group: null };
  if (!state.present) return state;
  if (action.kind === 'undo') {
    const previous = state.past.at(-1);
    return previous
      ? {
          present: previous,
          past: state.past.slice(0, -1),
          future: [state.present, ...state.future],
          group: null,
        }
      : state;
  }
  if (action.kind === 'redo') {
    const next = state.future[0];
    return next
      ? {
          present: next,
          past: [...state.past, state.present].slice(-HISTORY_LIMIT),
          future: state.future.slice(1),
          group: null,
        }
      : state;
  }
  if (action.project.id !== state.present.id) return state;
  if (action.kind === 'commit') return { ...state, present: action.project, group: null };
  if (action.project === state.present) return state;
  const grouped =
    action.group !== null &&
    action.group === state.group &&
    state.past.length > 0 &&
    state.future.length === 0;
  return {
    present: action.project,
    past: grouped ? state.past : [...state.past, state.present].slice(-HISTORY_LIMIT),
    future: [],
    group: action.group,
  };
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
    (project: GuideProject | null) => dispatch({ kind: 'reset', project }),
    []
  );
  const edit = (project: GuideProject, group: string | null = null) => {
    if (!canEdit() || !state.present || project.id !== state.present.id) return;
    dispatch({ kind: 'edit', project, group });
    onEdit();
  };
  const changeHistory = (kind: 'undo' | 'redo') => {
    if (!canEdit() || (kind === 'undo' ? state.past.length : state.future.length) === 0) return;
    dispatch({ kind });
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
    reset,
    commit: (project: GuideProject, reversible = false) =>
      dispatch(reversible ? { kind: 'edit', project, group: null } : { kind: 'commit', project }),
    update: edit,
    operate,
    undo: () => changeHistory('undo'),
    redo: () => changeHistory('redo'),
    sealEdit: () => dispatch({ kind: 'seal' }),
  };
}
