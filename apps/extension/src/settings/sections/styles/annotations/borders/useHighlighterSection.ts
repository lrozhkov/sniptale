import { useState, type DragEvent } from 'react';

import type { BorderPreset } from '../../../../../features/highlighter/contracts';
import { createHighlighterCrudActions } from './crud-actions';
import { createHighlighterDragActions } from './drag-actions';
import { createHighlighterSettingsActions } from './persistence-actions';
import { useHighlighterSectionState } from './state';

type HighlighterSectionStatus = Pick<
  ReturnType<typeof useHighlighterSectionState>,
  'isLoading' | 'settings'
>;
type HighlighterPresetViewState = {
  draggedId: string | null;
  dragOverId: string | null;
  editingPreset: BorderPreset | undefined;
  hoveredPresetId: string | null;
  isEditorOpen: boolean;
};
type HighlighterSectionActions = ReturnType<typeof createHighlighterCrudActions> &
  ReturnType<typeof createHighlighterDragActions>;
type HighlighterSettingsActions = ReturnType<typeof createHighlighterSettingsActions>;
type HighlighterSectionPublicActions = Omit<
  HighlighterSectionActions,
  'handleDragOver' | 'handleDragStart' | 'handleDrop'
> & {
  handleDragOver: (event: DragEvent, presetId: string) => void;
  handleDragStart: (event: DragEvent, presetId: string) => void;
  handleDrop: (event: DragEvent, targetId: string) => Promise<void>;
  handlePresetHoverChange: (presetId: string | null) => void;
} & Pick<HighlighterSettingsActions, 'handleSetDefaultPreset' | 'handleTogglePresetEnabled'>;

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
  const [hoveredPresetId, setHoveredPresetId] = useState<string | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingPreset, setEditingPreset] = useState<BorderPreset | undefined>(undefined);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const crudActions = createHighlighterCrudActions({
    ...persistenceState,
    setEditingPreset,
    setIsEditorOpen,
  });
  const dragActions = createHighlighterDragActions({
    ...persistenceState,
    draggedId,
    setDraggedId,
    setDragOverId,
  });
  const settingsActions = createHighlighterSettingsActions(persistenceState);

  const presets = {
    draggedId,
    dragOverId,
    editingPreset,
    hoveredPresetId,
    isEditorOpen,
    ...crudActions,
    ...dragActions,
    handleSetDefaultPreset: settingsActions.handleSetDefaultPreset,
    handleTogglePresetEnabled: settingsActions.handleTogglePresetEnabled,
    handlePresetHoverChange: setHoveredPresetId,
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
