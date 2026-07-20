import { translate } from '../../../../platform/i18n';
import { createLogger } from '@sniptale/platform/observability/logger';
import { toast } from '@sniptale/ui/product-feedback/toast-service';
import { reorderHighlighterPresets } from './helpers';
import {
  reconcileCurrentHighlighterSettings,
  saveQueuedHighlighterSettings,
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
  if (!state.draggedId || !settings || state.draggedId === targetId) {
    return null;
  }

  return reorderHighlighterPresets(settings.borderPresets, state.draggedId, targetId);
}

async function persistDraggedPresetDrop(
  state: HighlighterDragActionsState,
  draggedId: string,
  targetId: string
) {
  const settings = reconcileCurrentHighlighterSettings(state);
  if (!settings || draggedId === targetId) {
    return false;
  }

  const reorderedPresets = reorderHighlighterPresets(settings.borderPresets, draggedId, targetId);
  if (!reorderedPresets) {
    return false;
  }

  await saveQueuedHighlighterSettings(state, (currentSettings) => {
    const nextPresets = reorderHighlighterPresets(
      currentSettings.borderPresets,
      draggedId,
      targetId
    );
    if (!nextPresets) {
      return null;
    }

    return { ...currentSettings, borderPresets: nextPresets };
  });

  return true;
}

export function createHighlighterDragActions(state: HighlighterDragActionsState) {
  return {
    handleDragStart: (event: HighlighterDragEvent, presetId: string) => {
      state.setDraggedId(presetId);
      event.dataTransfer.effectAllowed = 'move';
    },
    handleDragOver: (event: HighlighterDragEvent, presetId: string) => {
      event.preventDefault();
      if (state.draggedId && state.draggedId !== presetId) {
        state.setDragOverId(presetId);
      }
    },
    handleDragLeave: () => state.setDragOverId(null),
    handleDrop: async (event: HighlighterDragEvent, targetId: string) => {
      event.preventDefault();
      const draggedId = state.draggedId;
      if (!computeReorderedPresetsForDrop(state, targetId)) {
        resetDragState(state);
        return;
      }

      try {
        await persistDraggedPresetDrop(state, draggedId as string, targetId);
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
