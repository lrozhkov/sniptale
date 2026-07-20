import type React from 'react';

import { createHighlighterSectionActions } from './actions';
import { useHighlighterSectionState } from './state';

type HighlighterSectionViewState = Omit<
  ReturnType<typeof useHighlighterSectionState>,
  'settingsPersistenceSession'
>;
type HighlighterSectionActions = ReturnType<typeof createHighlighterSectionActions>;
type HighlighterSectionPublicActions = Omit<
  HighlighterSectionActions,
  'handleDragOver' | 'handleDragStart' | 'handleDrop'
> & {
  handleDragOver: (event: React.DragEvent, presetId: string) => void;
  handleDragStart: (event: React.DragEvent, presetId: string) => void;
  handleDrop: (event: React.DragEvent, targetId: string) => Promise<void>;
};

export type HighlighterSectionState = HighlighterSectionViewState & HighlighterSectionPublicActions;

export function useHighlighterSection(): HighlighterSectionState {
  const state = useHighlighterSectionState();
  const { settingsPersistenceSession: _settingsPersistenceSession, ...viewState } = state;

  return {
    ...viewState,
    ...createHighlighterSectionActions(state),
  };
}
