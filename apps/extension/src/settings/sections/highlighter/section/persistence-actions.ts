import { translate } from '../../../../platform/i18n';
import { createLogger } from '@sniptale/platform/observability/logger';
import { toast } from '@sniptale/ui/product-feedback/toast-service';
import type {
  BlurSettings,
  FocusSettings,
  HighlighterSettings,
} from '../../../../features/highlighter/contracts';
import {
  reconcileCurrentHighlighterSettings,
  saveQueuedHighlighterSettings,
  type HighlighterSettingsPersistenceState,
} from './persistence';

type HighlighterSettingsActionsState = HighlighterSettingsPersistenceState;
const logger = createLogger({ namespace: 'SettingsHighlighter' });

async function saveHighlighterSettingsPatch(
  state: HighlighterSettingsActionsState,
  patch: Partial<HighlighterSettings>
): Promise<boolean> {
  try {
    return Boolean(
      await saveQueuedHighlighterSettings(state, (settings) => ({ ...settings, ...patch }))
    );
  } catch (error) {
    logger.error('Failed to save highlighter settings patch', error);
    toast.error(
      `${translate('common.states.error')}${translate('highlighter.section.saveErrorSuffix')}`
    );
    return false;
  }
}

async function saveDefaultHighlighterPreset(
  state: HighlighterSettingsActionsState,
  presetId: string
): Promise<boolean> {
  if (
    !reconcileCurrentHighlighterSettings(state)?.borderPresets.some(
      (preset) => preset.id === presetId
    )
  ) {
    return false;
  }

  try {
    return Boolean(
      await saveQueuedHighlighterSettings(state, (settings) => {
        if (!settings.borderPresets.some((preset) => preset.id === presetId)) {
          return null;
        }

        return { ...settings, defaultBorderPresetId: presetId };
      })
    );
  } catch (error) {
    logger.error('Failed to save highlighter settings patch', error);
    toast.error(
      `${translate('common.states.error')}${translate('highlighter.section.saveErrorSuffix')}`
    );
    return false;
  }
}

function buildToggledPresetPatch(state: HighlighterSettingsActionsState, presetId: string) {
  const settings = reconcileCurrentHighlighterSettings(state);
  const preset = settings?.borderPresets.find((item) => item.id === presetId);

  if (!settings || !preset || preset.isSystemDefault) {
    return null;
  }

  const nextEnabled = preset.enabled === false;
  const borderPresets = settings.borderPresets.map((item) =>
    item.id === presetId ? { ...item, enabled: nextEnabled } : item
  );
  const defaultBorderPresetId =
    borderPresets.find(
      (item) => item.id === settings.defaultBorderPresetId && item.enabled !== false
    )?.id ??
    borderPresets.find((item) => item.enabled !== false)?.id ??
    settings.defaultBorderPresetId;

  return { borderPresets, defaultBorderPresetId, nextEnabled };
}

function createTogglePresetEnabledHandler(state: HighlighterSettingsActionsState) {
  return async (presetId: string) => {
    const patch = buildToggledPresetPatch(state, presetId);
    if (!patch) {
      return;
    }

    const saved = await saveHighlighterSettingsPatch(state, {
      borderPresets: patch.borderPresets,
      defaultBorderPresetId: patch.defaultBorderPresetId,
    });

    if (saved) {
      toast.success(
        patch.nextEnabled
          ? translate('savePresets.messages.presetShown')
          : translate('savePresets.messages.presetHidden')
      );
    }
  };
}

export function createHighlighterSettingsActions(state: HighlighterSettingsActionsState) {
  return {
    handleSetDefaultPreset: async (presetId: string) => {
      const saved = await saveDefaultHighlighterPreset(state, presetId);
      if (saved) {
        toast.success(translate('highlighter.section.defaultUpdated'));
      }
    },
    handleUpdateBlurSettings: async (blurSettings: BlurSettings) => {
      await saveHighlighterSettingsPatch(state, {
        defaultBlurSettings: blurSettings,
      });
    },
    handleUpdateFocusSettings: async (focusSettings: FocusSettings) => {
      await saveHighlighterSettingsPatch(state, {
        defaultFocusSettings: focusSettings,
      });
    },
    handleTogglePresetEnabled: createTogglePresetEnabledHandler(state),
  };
}
