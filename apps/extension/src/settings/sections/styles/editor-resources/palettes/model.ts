import type { EditorPaletteSettings } from '../../../../../features/editor/document/presets';
import type { EditorPaletteKey } from './types';

export function reorderPalette(args: {
  draggedIndex: number | null;
  palette: EditorPaletteSettings;
  key: EditorPaletteKey;
  targetIndex: number;
}) {
  if (args.draggedIndex === null || args.draggedIndex === args.targetIndex) return null;
  const colors = [...args.palette[args.key]];
  const [color] = colors.splice(args.draggedIndex, 1);
  if (!color) return null;
  colors.splice(args.targetIndex, 0, color);
  return { ...args.palette, [args.key]: colors };
}
