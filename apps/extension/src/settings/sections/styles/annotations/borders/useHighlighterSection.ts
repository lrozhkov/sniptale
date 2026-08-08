import { useState } from 'react';

import type { BorderPreset } from '../../../../../features/highlighter/contracts';
import { createHighlighterCrudActions } from './crud-actions';
import { createHighlighterOrderingActions } from './ordering-actions';
import { createHighlighterSettingsActions } from './persistence-actions';
import { useHighlighterSectionState } from './state';

type HighlighterSectionStatus = Pick<
  ReturnType<typeof useHighlighterSectionState>,
  'isLoading' | 'settings'
>;
type HighlighterPresetViewState = {
  editingPreset: BorderPreset | undefined;
  isEditorOpen: boolean;
};
type HighlighterSectionActions = ReturnType<typeof createHighlighterCrudActions> &
  ReturnType<typeof createHighlighterOrderingActions>;
type HighlighterSettingsActions = ReturnType<typeof createHighlighterSettingsActions>;
type HighlighterSectionPublicActions = HighlighterSectionActions &
  Pick<HighlighterSettingsActions, 'handleSetDefaultPreset' | 'handleTogglePresetEnabled'>;

export type HighlighterPresetController = HighlighterPresetViewState &
  HighlighterSectionPublicActions;
export type HighlighterEffectActions = Pick<
  HighlighterSettingsActions,
  'handleUpdateBlurSettings' | 'handleUpdateFocusSettings'
>;
type HighlighterSectionController = {
  effects: HighlighterEffectActions;
  presets: HighlighterPresetController;
  status: HighlighterSectionStatus;
};

export function useHighlighterSection(): HighlighterSectionController {
  const persistenceState = useHighlighterSectionState();
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingPreset, setEditingPreset] = useState<BorderPreset | undefined>(undefined);

  const crudActions = createHighlighterCrudActions({
    ...persistenceState,
    setEditingPreset,
    setIsEditorOpen,
  });
  const orderingActions = createHighlighterOrderingActions({
    ...persistenceState,
  });
  const settingsActions = createHighlighterSettingsActions(persistenceState);

  const presets = {
    editingPreset,
    isEditorOpen,
    ...crudActions,
    ...orderingActions,
    handleSetDefaultPreset: settingsActions.handleSetDefaultPreset,
    handleTogglePresetEnabled: settingsActions.handleTogglePresetEnabled,
  };

  return {
    effects: {
      handleUpdateBlurSettings: settingsActions.handleUpdateBlurSettings,
      handleUpdateFocusSettings: settingsActions.handleUpdateFocusSettings,
    },
    presets,
    status: {
      isLoading: persistenceState.isLoading,
      settings: persistenceState.settings,
    },
  };
}
