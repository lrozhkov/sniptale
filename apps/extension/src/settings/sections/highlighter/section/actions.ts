import type { useHighlighterSectionState } from './state';
import { createHighlighterCrudActions } from './crud-actions';
import { createHighlighterDragActions } from './drag-actions';
import { createHighlighterSettingsActions } from './persistence-actions';

type HighlighterSectionStateModel = ReturnType<typeof useHighlighterSectionState>;

export function createHighlighterSectionActions(state: HighlighterSectionStateModel) {
  const crudActions = createHighlighterCrudActions(state);
  const settingsActions = createHighlighterSettingsActions(state);
  const dragActions = createHighlighterDragActions(state);

  return {
    ...crudActions,
    ...settingsActions,
    ...dragActions,
  };
}
