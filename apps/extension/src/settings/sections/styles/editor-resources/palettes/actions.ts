import type { EditorPaletteSettings } from '../../../../../features/editor/document/presets';
import { saveEditorPaletteSettings } from '../../../../../composition/persistence/editor-presets';
import { translate } from '../../../../../platform/i18n';
import { toast } from '@sniptale/ui/product-feedback/toast-service';
import { reorderPaletteBefore } from './model';
import type { EditorPaletteKey } from './types';

async function save(palette: EditorPaletteSettings) {
  try {
    await saveEditorPaletteSettings(palette);
  } catch {
    toast.error(translate('common.states.error'));
  }
}

export function createPaletteActions(args: {
  key: EditorPaletteKey;
  palette: EditorPaletteSettings;
}) {
  return {
    changeColor: (index: number, color: string) =>
      save({
        ...args.palette,
        [args.key]: args.palette[args.key].map((item, itemIndex) =>
          itemIndex === index ? color : item
        ),
      }),
    moveColor: async (itemIndex: number, beforeIndex: number | null) => {
      const next = reorderPaletteBefore({ ...args, itemIndex, beforeIndex });
      if (next) await save(next);
    },
  };
}
