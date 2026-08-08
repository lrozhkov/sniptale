import type { EditorPresetFamily } from '../../../../../features/editor/document/presets';
import {
  deleteEditorPreset,
  setDefaultEditorPreset,
  setEditorPresetEnabled,
  updateEditorPresetOrder,
} from '../../../../../composition/persistence/editor-presets';
import { translate } from '../../../../../platform/i18n';
import { toast } from '@sniptale/ui/product-feedback/toast-service';
import { reorderToolPresetIdsBefore } from './model';

export function createToolPresetActions(args: {
  currentPresets: ReadonlyArray<{ id: string }>;
  owner: EditorPresetFamily;
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
    movePreset: async (itemId: string, beforeItemId: string | null) => {
      const ids = reorderToolPresetIdsBefore(args.currentPresets, itemId, beforeItemId);
      if (ids) await run(() => updateEditorPresetOrder(args.owner, ids));
    },
  };
}
