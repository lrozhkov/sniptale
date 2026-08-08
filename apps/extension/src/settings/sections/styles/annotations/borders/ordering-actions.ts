import { translate } from '../../../../../platform/i18n';
import { createLogger } from '@sniptale/platform/observability/logger';
import { toast } from '@sniptale/ui/product-feedback/toast-service';
import { updateBorderPresetsOrder } from '../../../../../composition/persistence/highlighter';
import { reorderHighlighterPresetsBefore } from './helpers';
import {
  reconcileCurrentHighlighterSettings,
  runQueuedHighlighterMutation,
  type HighlighterSettingsPersistenceState,
} from './persistence';

const logger = createLogger({ namespace: 'SettingsHighlighter' });

export function createHighlighterOrderingActions(state: HighlighterSettingsPersistenceState) {
  const persistOrder = async (reordered: ReturnType<typeof reorderHighlighterPresetsBefore>) => {
    if (!reordered) return;
    try {
      await runQueuedHighlighterMutation(state, () =>
        updateBorderPresetsOrder(reordered.map((preset) => preset.id))
      );
    } catch (error) {
      logger.error('Failed to reorder highlighter presets', error);
      toast.error(
        `${translate('common.states.error')}${translate('highlighter.section.reorderErrorSuffix')}`
      );
    }
  };
  return {
    handleMoveBefore: async (presetId: string, beforePresetId: string | null) => {
      const settings = reconcileCurrentHighlighterSettings(state);
      if (!settings) return;
      await persistOrder(
        reorderHighlighterPresetsBefore(settings.borderPresets, presetId, beforePresetId)
      );
    },
  };
}
