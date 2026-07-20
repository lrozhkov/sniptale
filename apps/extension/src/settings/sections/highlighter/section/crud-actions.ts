import { translate } from '../../../../platform/i18n';
import { createLogger } from '@sniptale/platform/observability/logger';
import { DEFAULT_BORDER_PRESET } from '../../../../composition/persistence/highlighter';
import { toast } from '@sniptale/ui/product-feedback/toast-service';
import type { BorderPreset, HighlighterSettings } from '../../../../features/highlighter/contracts';
import { normalizeHighlighterPresetOrders } from './helpers';
import {
  reconcileCurrentHighlighterSettings,
  saveQueuedHighlighterSettings,
  type HighlighterSettingsPersistenceState,
} from './persistence';

type HighlighterCrudActionsState = HighlighterSettingsPersistenceState & {
  setEditingPreset: (value: BorderPreset | undefined) => void;
  setIsEditorOpen: (value: boolean) => void;
};
const logger = createLogger({ namespace: 'SettingsHighlighter' });

function buildSavedPresetSettings(
  settings: HighlighterSettings,
  preset: BorderPreset,
  existingIndex: number
) {
  if (existingIndex >= 0) {
    const nextPresets = [...settings.borderPresets];
    nextPresets[existingIndex] = { ...preset, order: nextPresets[existingIndex]?.order ?? 0 };
    return { ...settings, borderPresets: normalizeHighlighterPresetOrders(nextPresets) };
  }

  return {
    ...settings,
    borderPresets: normalizeHighlighterPresetOrders([...settings.borderPresets, preset]),
  };
}

function openHighlighterEditor(state: HighlighterCrudActionsState, preset?: BorderPreset) {
  state.setEditingPreset(preset);
  state.setIsEditorOpen(true);
}

function buildDeletedPresetSettings(
  currentSettings: HighlighterSettings,
  presetId: string,
  blockedReasonRef: { current: 'last' | 'missing' | 'system' | null }
) {
  const currentPreset = currentSettings.borderPresets.find((item) => item.id === presetId);
  if (!currentPreset) {
    blockedReasonRef.current = 'missing';
    return null;
  }

  if (currentPreset.isSystemDefault) {
    blockedReasonRef.current = 'system';
    return null;
  }

  if (currentSettings.borderPresets.length <= 1) {
    blockedReasonRef.current = 'last';
    return null;
  }

  return {
    ...currentSettings,
    borderPresets: normalizeHighlighterPresetOrders(
      currentSettings.borderPresets.filter((item) => item.id !== presetId)
    ),
    defaultBorderPresetId:
      currentSettings.defaultBorderPresetId === presetId
        ? DEFAULT_BORDER_PRESET.id
        : currentSettings.defaultBorderPresetId,
  };
}

function reportBlockedPresetDelete(reason: 'last' | 'missing' | 'system' | null) {
  if (reason === 'system') {
    toast.error(translate('highlighter.section.systemPresetDeleteError'));
  }

  if (reason === 'last') {
    toast.error(translate('highlighter.section.lastPresetDeleteError'));
  }
}

async function deleteHighlighterPreset(state: HighlighterCrudActionsState, preset: BorderPreset) {
  if (preset.isSystemDefault) {
    toast.error(translate('highlighter.section.systemPresetDeleteError'));
    return;
  }
  const settings = reconcileCurrentHighlighterSettings(state);
  if (!settings || settings.borderPresets.length <= 1) {
    toast.error(translate('highlighter.section.lastPresetDeleteError'));
    return;
  }

  try {
    const blockedReasonRef = {
      current: null as 'last' | 'missing' | 'system' | null,
    };
    const updated = await saveQueuedHighlighterSettings(state, (currentSettings) =>
      buildDeletedPresetSettings(currentSettings, preset.id, blockedReasonRef)
    );
    if (!updated) {
      reportBlockedPresetDelete(blockedReasonRef.current);
      return;
    }
    toast.success(translate('highlighter.section.presetDeleted'));
  } catch (error) {
    logger.error('Failed to delete highlighter preset', error);
    toast.error(
      `${translate('common.states.error')}${translate('highlighter.section.deleteErrorSuffix')}`
    );
  }
}

async function saveHighlighterPreset(state: HighlighterCrudActionsState, preset: BorderPreset) {
  try {
    let createdPreset = false;
    const updated = await saveQueuedHighlighterSettings(state, (settings) => {
      const existingIndex = settings.borderPresets.findIndex((item) => item.id === preset.id);
      createdPreset = existingIndex < 0;
      return buildSavedPresetSettings(settings, preset, existingIndex);
    });
    if (!updated) {
      return;
    }
    state.setIsEditorOpen(false);
    toast.success(
      createdPreset
        ? translate('highlighter.section.presetCreated')
        : translate('highlighter.section.presetUpdated')
    );
  } catch (error) {
    logger.error('Failed to save highlighter preset', error);
    toast.error(
      `${translate('common.states.error')}${translate('highlighter.section.saveErrorSuffix')}`
    );
  }
}

export function createHighlighterCrudActions(state: HighlighterCrudActionsState) {
  return {
    handleAddPreset: () => openHighlighterEditor(state),
    handleDeletePreset: async (preset: BorderPreset) => deleteHighlighterPreset(state, preset),
    handleEditPreset: (preset: BorderPreset) => openHighlighterEditor(state, preset),
    handleSavePreset: async (preset: BorderPreset) => saveHighlighterPreset(state, preset),
  };
}
