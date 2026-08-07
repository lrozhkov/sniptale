import type { EditorPaletteSettings } from '../../../../../features/editor/document/presets';
import { saveEditorPaletteSettings } from '../../../../../composition/persistence/editor-presets';
import { translate } from '../../../../../platform/i18n';
import { toast } from '@sniptale/ui/product-feedback/toast-service';
import { reorderPalette } from './model';
import type { EditorPaletteKey } from './types';

async function save(palette: EditorPaletteSettings) {
  try {
    await saveEditorPaletteSettings(palette);
  } catch {
    toast.error(translate('common.states.error'));
  }
}

export function createPaletteActions(args: {
  draggedIndex: number | null;
  key: EditorPaletteKey;
  palette: EditorPaletteSettings;
  clearDrag: () => void;
}) {
  return {
    changeColor: (index: number, color: string) =>
      save({
        ...args.palette,
        [args.key]: args.palette[args.key].map((item, itemIndex) =>
          itemIndex === index ? color : item
        ),
      }),
    dropColor: async (targetIndex: number) => {
      const next = reorderPalette({ ...args, targetIndex });
      args.clearDrag();
      if (next) await save(next);
    },
  };
}
