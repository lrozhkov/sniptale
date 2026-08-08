import type { EditorPaletteSettings } from '../../../../../features/editor/document/presets';
import type { EditorPaletteKey } from './types';

export function reorderPaletteBefore(args: {
  itemIndex: number;
  beforeIndex: number | null;
  palette: EditorPaletteSettings;
  key: EditorPaletteKey;
}) {
  const colors = [...args.palette[args.key]];
  const [color] = colors.splice(args.itemIndex, 1);
  if (!color) return null;
  const insertionIndex =
    args.beforeIndex === null
      ? colors.length
      : args.beforeIndex > args.itemIndex
        ? args.beforeIndex - 1
        : args.beforeIndex;
  colors.splice(insertionIndex, 0, color);
  return { ...args.palette, [args.key]: colors };
}
