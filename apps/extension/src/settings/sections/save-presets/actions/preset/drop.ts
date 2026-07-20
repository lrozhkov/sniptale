import type { Settings } from '../../../../../contracts/settings';
import { reorderPresets } from '../../state/helpers';
import type { SavePresetsDragState, SavePresetsSyncState } from '../../state/types';

export function createDropPresetAction(
  sync: SavePresetsSyncState,
  dragState: SavePresetsDragState,
  persistSettings: (partialSettings: Partial<Settings>) => Promise<void>
) {
  return async (targetId: string) => {
    if (!dragState.draggedId || dragState.draggedId === targetId) {
      dragState.setDraggedId(null);
      dragState.setDragOverId(null);
      return;
    }

    const nextPresets = reorderPresets(sync.presets, dragState.draggedId, targetId);

    if (!nextPresets) {
      dragState.setDraggedId(null);
      dragState.setDragOverId(null);
      return;
    }

    const previousPresets = sync.presets;
    sync.setPresets(nextPresets);
    try {
      await persistSettings({ presets: nextPresets });
    } catch (error) {
      sync.setPresets(previousPresets);
      throw error;
    }
    dragState.setDraggedId(null);
    dragState.setDragOverId(null);
  };
}
