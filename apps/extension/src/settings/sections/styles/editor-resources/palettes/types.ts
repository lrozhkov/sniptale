import type { EditorPaletteSettings } from '../../../../../features/editor/document/presets';
export type EditorPaletteKey = keyof EditorPaletteSettings;
export type PaletteSettingsKey = EditorPaletteKey | 'drawing';
