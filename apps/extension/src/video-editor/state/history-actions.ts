import type { StateCreator } from 'zustand';
import type { VideoEditorProjectHistoryActions } from '../contracts/commands/history';
import { redoVideoEditorProjectHistory, undoVideoEditorProjectHistory } from '../project/history';
import { applyProjectSnapshot } from '../project/state/helpers';
import type { VideoEditorState } from './types';

type VideoEditorStoreSet = Parameters<StateCreator<VideoEditorState>>[0];

export function createVideoEditorProjectHistoryActions(
  set: VideoEditorStoreSet
): VideoEditorProjectHistoryActions {
  return {
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
