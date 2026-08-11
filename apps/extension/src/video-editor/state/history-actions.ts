import type { StateCreator } from 'zustand';
import type { VideoEditorProjectHistoryActions } from '../contracts/commands/history';
import {
  beginVideoEditorProjectHistoryTransaction,
  endVideoEditorProjectHistoryTransaction,
  redoVideoEditorProjectHistory,
  undoVideoEditorProjectHistory,
} from '../project/history';
import { applyProjectSnapshot } from '../project/state/helpers';
import type { VideoEditorState } from './types';

type VideoEditorStoreSet = Parameters<StateCreator<VideoEditorState>>[0];
type VideoEditorStoreGet = Parameters<StateCreator<VideoEditorState>>[1];

export function createVideoEditorProjectHistoryActions(
  set: VideoEditorStoreSet,
  get: VideoEditorStoreGet
): VideoEditorProjectHistoryActions {
  return {
    beginProjectHistoryTransaction: () => {
      let lease = null;
      set((state) => {
        if (!state.project) return {};
        const projectHistory = beginVideoEditorProjectHistoryTransaction(
          state.projectHistory,
          state.project
        );
        lease = projectHistory.transaction?.lease ?? null;
        return { projectHistory };
      });
      return lease;
    },
    endProjectHistoryTransaction: (lease) =>
      set((state) => {
        if (!state.project || state.projectHistory.transaction?.lease !== lease) return {};
        return {
          projectHistory: endVideoEditorProjectHistoryTransaction(
            state.projectHistory,
            state.project
          ),
        };
      }),
    isProjectHistoryTransactionCurrent: (lease) =>
      get().projectHistory.transaction?.lease === lease,
    undoProject: () => set((state) => applyHistoryTransition(state, 'undo')),
    redoProject: () => set((state) => applyHistoryTransition(state, 'redo')),
  };
}

function applyHistoryTransition(
  state: VideoEditorState,
  direction: 'undo' | 'redo'
): Partial<VideoEditorState> {
  if (!state.project) return {};
  const transition =
    direction === 'undo'
      ? undoVideoEditorProjectHistory(state.projectHistory, state.project)
      : redoVideoEditorProjectHistory(state.projectHistory, state.project);
  if (!transition) return {};
  if (transition.status === 'failed') return { projectHistory: transition.history };
  return {
    ...applyProjectSnapshot(state, transition.project),
    projectHistory: transition.history,
  };
}
