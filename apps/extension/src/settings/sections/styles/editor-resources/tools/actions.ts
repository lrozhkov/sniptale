import type { EditorPresetFamily } from '../../../../../features/editor/document/presets';
import {
  deleteEditorPreset,
  setDefaultEditorPreset,
  setEditorPresetEnabled,
  updateEditorPresetOrder,
} from '../../../../../composition/persistence/editor-presets';
import { translate } from '../../../../../platform/i18n';
import { toast } from '@sniptale/ui/product-feedback/toast-service';
import { reorderToolPresetIds } from './model';

export function createToolPresetActions(args: {
  currentPresets: ReadonlyArray<{ id: string }>;
  draggedId: string | null;
  owner: EditorPresetFamily;
  clearDrag: () => void;
}) {
  const run = async (operation: () => Promise<unknown>) => {
    try {
      await operation();
    } catch {
      toast.error(translate('common.states.error'));
    }
  };
  return {
    deletePreset: (id: string) => run(() => deleteEditorPreset(args.owner, id)),
    makeDefault: (id: string) => run(() => setDefaultEditorPreset(args.owner, id)),
    togglePreset: (id: string, enabled: boolean) =>
      run(() => setEditorPresetEnabled(args.owner, id, enabled)),
    dropPreset: async (targetId: string) => {
      const ids = reorderToolPresetIds(args.currentPresets, args.draggedId ?? '', targetId);
      args.clearDrag();
      if (ids) await run(() => updateEditorPresetOrder(args.owner, ids));
    },
  };
}
