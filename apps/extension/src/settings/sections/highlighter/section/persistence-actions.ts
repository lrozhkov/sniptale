import { translate } from '../../../../platform/i18n';
import { createLogger } from '@sniptale/platform/observability/logger';
import { toast } from '@sniptale/ui/product-feedback/toast-service';
import type { BlurSettings, FocusSettings } from '../../../../features/highlighter/contracts';
import {
  saveDefaultBlurSettings,
  saveDefaultFocusSettings,
  setBorderPresetEnabled,
  setDefaultBorderPreset,
} from '../../../../composition/persistence/highlighter';
import {
  reconcileCurrentHighlighterSettings,
  runQueuedHighlighterMutation,
  type HighlighterSettingsPersistenceState,
} from './persistence';

type HighlighterSettingsActionsState = HighlighterSettingsPersistenceState;
const logger = createLogger({ namespace: 'SettingsHighlighter' });

async function runSettingsMutation(
  state: HighlighterSettingsActionsState,
  mutation: () => Promise<boolean | void>
): Promise<boolean> {
  try {
    return (await runQueuedHighlighterMutation(state, mutation))?.applied ?? false;
  } catch (error) {
    logger.error('Failed to save highlighter settings mutation', error);
    toast.error(
      `${translate('common.states.error')}${translate('highlighter.section.saveErrorSuffix')}`
    );
    return false;
  }
}

function createTogglePresetEnabledHandler(state: HighlighterSettingsActionsState) {
  return async (presetId: string) => {
    const preset = reconcileCurrentHighlighterSettings(state)?.borderPresets.find(
      (item) => item.id === presetId
    );
    if (!preset) return;
    const nextEnabled = preset.enabled === false;
    const saved = await runSettingsMutation(state, () =>
      setBorderPresetEnabled(presetId, nextEnabled)
    );

    if (saved) {
      toast.success(
        nextEnabled
          ? translate('highlighter.section.templateShown')
          : translate('highlighter.section.templateHidden')
      );
    }
  };
}

export function createHighlighterSettingsActions(state: HighlighterSettingsActionsState) {
  return {
    handleSetDefaultPreset: async (presetId: string) => {
      const saved = await runSettingsMutation(state, () => setDefaultBorderPreset(presetId));
      if (saved) toast.success(translate('highlighter.section.defaultUpdated'));
    },
    handleUpdateBlurSettings: async (blurSettings: BlurSettings) => {
      await runSettingsMutation(state, () => saveDefaultBlurSettings(blurSettings));
    },
    handleUpdateFocusSettings: async (focusSettings: FocusSettings) => {
      await runSettingsMutation(state, () => saveDefaultFocusSettings(focusSettings));
    },
    handleTogglePresetEnabled: createTogglePresetEnabledHandler(state),
  };
}
