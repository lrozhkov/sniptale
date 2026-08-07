import { translate } from '../../../../../platform/i18n';
import { createLogger } from '@sniptale/platform/observability/logger';
import { toast } from '@sniptale/ui/product-feedback/toast-service';
import { updateBorderPresetsOrder } from '../../../../../composition/persistence/highlighter';
import { reorderHighlighterPresets } from './helpers';
import {
  reconcileCurrentHighlighterSettings,
  runQueuedHighlighterMutation,
  type HighlighterSettingsPersistenceState,
} from './persistence';

type HighlighterDragEvent = {
  dataTransfer: { effectAllowed: string };
  preventDefault: () => void;
};
type HighlighterDragActionsState = HighlighterSettingsPersistenceState & {
  draggedId: string | null;
  setDraggedId: (value: string | null) => void;
  setDragOverId: (value: string | null) => void;
};
const logger = createLogger({ namespace: 'SettingsHighlighter' });

function resetDragState(state: HighlighterDragActionsState) {
  state.setDraggedId(null);
  state.setDragOverId(null);
}

function computeReorderedPresetsForDrop(state: HighlighterDragActionsState, targetId: string) {
  const settings = reconcileCurrentHighlighterSettings(state);
  if (!state.draggedId || !settings || state.draggedId === targetId) return null;
  return reorderHighlighterPresets(settings.borderPresets, state.draggedId, targetId);
}

export function createHighlighterDragActions(state: HighlighterDragActionsState) {
  return {
    handleDragStart: (event: HighlighterDragEvent, presetId: string) => {
      state.setDraggedId(presetId);
      event.dataTransfer.effectAllowed = 'move';
    },
    handleDragOver: (event: HighlighterDragEvent, presetId: string) => {
      event.preventDefault();
      if (state.draggedId && state.draggedId !== presetId) state.setDragOverId(presetId);
    },
    handleDragLeave: () => state.setDragOverId(null),
    handleDrop: async (event: HighlighterDragEvent, targetId: string) => {
      event.preventDefault();
      const reordered = computeReorderedPresetsForDrop(state, targetId);
      if (!reordered) {
        resetDragState(state);
        return;
      }
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
      resetDragState(state);
    },
    handleDragEnd: () => resetDragState(state),
  };
}
