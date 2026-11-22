import { areScenarioProjectsEqual } from '../../../composition/persistence/scenario/aggregate-comparison';
import { useCallback, useMemo, useReducer } from 'react';
import {
  applyGuideStructureOperation,
  type GuideStructureOperation,
} from '../../../features/scenario/project/public';
import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import { EDITOR_HISTORY_LIMITS } from '../../../features/editor-history/policy';
import {
  createScenarioEditingRetainer,
  retainScenarioEditingHistory,
} from '../../../composition/persistence/scenario/editing-history';
import type { ScenarioEditingHistory } from '../../../composition/persistence/scenario/contracts';

const HISTORY_LIMIT = EDITOR_HISTORY_LIMITS.maxActions;
/** Page-owned editing buffer; persistence owns the committed navigation checkpoint. */
export interface GuideHistory {
  present: GuideProject | null;
  past: GuideProject[];
  future: GuideProject[];
  group: string | null;
  actionId?: string;
  groupOrigin?: { project: GuideProject; past: GuideProject[]; future: GuideProject[] };
}

function guideActionIdentity(state: GuideHistory, actionId?: string): GuideHistory {
  const { actionId: _previous, groupOrigin: _origin, ...rest } = state;
  return { ...rest, ...(actionId ? { actionId } : {}) };
}

function retainGuideHistory(
  state: GuideHistory,
  retain: typeof retainScenarioEditingHistory
): GuideHistory {
  if (!state.present) return state;
  const checkpoint = retain(state.present, state.past, state.future);
  const past = sameBranch(checkpoint.past, state.past) ? state.past : [...checkpoint.past];
  const future = sameBranch(checkpoint.future, state.future)
    ? state.future
    : [...checkpoint.future];
  return past === state.past && future === state.future ? state : { ...state, past, future };
}

function sameBranch(left: readonly GuideProject[], right: readonly GuideProject[]): boolean {
  return left.length === right.length && left.every((project, index) => project === right[index]);
}
type HistoryAction =
  | { kind: 'reset'; project: GuideProject | null; past?: GuideProject[]; future?: GuideProject[] }
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
export function reduceGuideHistory(
  state: GuideHistory,
  action: HistoryAction,
  retainSnapshots: typeof retainScenarioEditingHistory = retainScenarioEditingHistory
): GuideHistory {
  const retain = (next: GuideHistory) => retainGuideHistory(next, retainSnapshots);
  if (action.kind === 'reset')
    return retain({
      present: action.project,
      past: (action.past ?? [])
        .filter((project) => project.id === action.project?.id)
        .slice(-HISTORY_LIMIT),
      future: (action.future ?? [])
        .filter((project) => project.id === action.project?.id)
        .slice(0, HISTORY_LIMIT),
      group: null,
    });
  if (action.kind === 'seal') {
    const { groupOrigin: _origin, ...rest } = state;
    return { ...rest, group: null };
  }
  if (!state.present) return state;
  if (action.kind === 'undo') {
    const previous = state.past.at(-1);
    return previous
      ? retain({
          ...guideActionIdentity(
            {
              ...state,
              present: previous,
              past: state.past.slice(0, -1),
              future: [state.present, ...state.future],
              group: null,
            },
            action.actionId
          ),
        })
      : state;
  }
  if (action.kind === 'redo') {
    const next = state.future[0];
    return next
      ? retain({
          ...guideActionIdentity(
            {
              ...state,
              present: next,
              past: [...state.past, state.present].slice(-HISTORY_LIMIT),
              future: state.future.slice(1),
              group: null,
            },
            action.actionId
          ),
        })
      : state;
  }
  if (action.project.id !== state.present.id) return state;
  if (action.kind === 'publish') {
    const present =
      state.present === action.source
        ? reusePublishedGuideItems(action.project, action.source)
        : { ...state.present, updatedAt: action.project.updatedAt };
    return retain({ ...state, present });
  }
  if (action.kind === 'commit')
    return retain(
      guideActionIdentity({
        ...state,
        present: action.project,
        group: null,
        ...(action.reversible && !sameGuideContent(action.project, state.present)
          ? { past: [...state.past, state.present], future: [] }
          : {}),
      })
    );
  if (sameGuideContent(action.project, state.present)) return state;
  const grouped =
    action.group !== null && action.group === state.group && state.groupOrigin !== undefined;
  const origin = grouped
    ? state.groupOrigin!
    : {
        project: state.present,
        past: state.past,
        future: state.future,
      };
  if (grouped && sameGuideContent(action.project, origin.project)) {
    const { groupOrigin: _origin, ...rest } = state;
    return retain({
      ...rest,
      present: { ...origin.project, updatedAt: state.present.updatedAt },
      past: origin.past,
      future: origin.future,
      group: null,
    });
  }
  return retain({
    ...guideActionIdentity(
      {
        ...state,
        present: action.project,
        past: grouped ? state.past : [...state.past, state.present].slice(-HISTORY_LIMIT),
        future: [],
        group: action.group,
      },
      grouped ? state.actionId : action.actionId
    ),
    ...(action.group === null ? {} : { groupOrigin: origin }),
  });
}

function sameGuideContent(left: GuideProject, right: GuideProject): boolean {
  return left === right || areScenarioProjectsEqual({ ...left, updatedAt: right.updatedAt }, right);
}

/** Cache immutable unit encodings for this reducer's disposable history. */
export function createGuideHistoryReducer() {
  const retain = createScenarioEditingRetainer();
  return (state: GuideHistory, action: HistoryAction) => reduceGuideHistory(state, action, retain);
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
  const reduce = useMemo(createGuideHistoryReducer, []);
  const [state, dispatch] = useReducer(reduce, {
    present: null,
    past: [],
    future: [],
    group: null,
  });
  const editingHistory = useMemo<ScenarioEditingHistory>(
    () => ({ version: 1, past: state.past, future: state.future }),
    [state.past, state.future]
  );
  const reset = useCallback(
    (project: GuideProject | null, past: GuideProject[] = [], future: GuideProject[] = []) =>
      dispatch({ kind: 'reset', project, past, future }),
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
    editingHistory,
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
