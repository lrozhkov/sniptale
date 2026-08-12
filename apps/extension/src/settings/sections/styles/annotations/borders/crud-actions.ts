import { translate } from '../../../../../platform/i18n';
import { createLogger } from '@sniptale/platform/observability/logger';
import { toast } from '@sniptale/ui/product-feedback/toast-service';
import type { BorderPreset } from '../../../../../features/highlighter/contracts';
import {
  addBorderPresetWithOutcome,
  deleteBorderPreset,
  resetSystemBorderPreset,
  updateBorderPresetWithOutcome,
} from '../../../../../composition/persistence/highlighter';
import {
  reconcileCurrentHighlighterSettings,
  runQueuedHighlighterMutation,
  type HighlighterSettingsPersistenceState,
} from './persistence';

type HighlighterCrudActionsState = HighlighterSettingsPersistenceState & {
  setEditingPreset: (value: BorderPreset | undefined) => void;
  setIsEditorOpen: (value: boolean) => void;
};
const logger = createLogger({ namespace: 'SettingsHighlighter' });

function openHighlighterEditor(state: HighlighterCrudActionsState, preset?: BorderPreset) {
  state.setEditingPreset(preset);
  state.setIsEditorOpen(true);
}

async function deleteHighlighterPreset(state: HighlighterCrudActionsState, preset: BorderPreset) {
  if (preset.origin === 'system') return;
  try {
    await runQueuedHighlighterMutation(state, () => deleteBorderPreset(preset.id));
  } catch (error) {
    logger.error('Failed to delete highlighter preset', error);
    toast.error(
      `${translate('common.states.error')}${translate('highlighter.section.deleteErrorSuffix')}`
    );
  }
}

async function saveHighlighterPreset(state: HighlighterCrudActionsState, preset: BorderPreset) {
  const created = !reconcileCurrentHighlighterSettings(state)?.borderPresets.some(
    (item) => item.id === preset.id
  );
  try {
    const result = await runQueuedHighlighterMutation(state, () =>
      created ? addBorderPresetWithOutcome(preset) : updateBorderPresetWithOutcome(preset)
    );
    if (!result || result.outcome === 'rejected') return;
    state.setIsEditorOpen(false);
  } catch (error) {
    logger.error('Failed to save highlighter preset', error);
    toast.error(
      `${translate('common.states.error')}${translate('highlighter.section.saveErrorSuffix')}`
    );
  }
}

async function resetHighlighterPreset(state: HighlighterCrudActionsState, presetId: string) {
  try {
    await runQueuedHighlighterMutation(state, () => resetSystemBorderPreset(presetId));
  } catch (error) {
    logger.error('Failed to reset highlighter preset', error);
    toast.error(
      `${translate('common.states.error')}${translate('highlighter.section.saveErrorSuffix')}`
    );
  }
}

export function createHighlighterCrudActions(state: HighlighterCrudActionsState) {
  return {
    handleAddPreset: () => openHighlighterEditor(state),
    handleCloseEditor: () => state.setIsEditorOpen(false),
    handleDeletePreset: async (preset: BorderPreset) => deleteHighlighterPreset(state, preset),
    handleEditPreset: (preset: BorderPreset) => openHighlighterEditor(state, preset),
    handleResetPreset: async (presetId: string) => resetHighlighterPreset(state, presetId),
    handleSavePreset: async (preset: BorderPreset) => saveHighlighterPreset(state, preset),
  };
}
