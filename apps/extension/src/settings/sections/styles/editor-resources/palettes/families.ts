import { translate } from '../../../../../platform/i18n';
import type { PaletteSettingsKey } from './types';

export const EDITOR_PALETTE_KEYS: readonly PaletteSettingsKey[] = [
  'drawing',
  'shapeStroke',
  'shapeFill',
  'textColor',
  'textBackground',
  'sceneBackground',
];
export function getEditorPaletteLabel(key: PaletteSettingsKey): string {
  const suffix = {
    drawing: 'Drawing',
    shapeStroke: 'ShapeStroke',
    shapeFill: 'ShapeFill',
    textColor: 'TextColor',
    textBackground: 'TextBackground',
    sceneBackground: 'SceneBackground',
  }[key];
  return translate(`settings.editor.palette${suffix}` as Parameters<typeof translate>[0]);
}
