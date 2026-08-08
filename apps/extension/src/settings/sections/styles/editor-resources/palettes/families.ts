import { translate } from '../../../../../platform/i18n';
import type { EditorPaletteKey } from './types';

export const EDITOR_PALETTE_KEYS: readonly EditorPaletteKey[] = [
  'shapeStroke',
  'shapeFill',
  'textColor',
  'textBackground',
  'sceneBackground',
];
export function getEditorPaletteLabel(key: EditorPaletteKey): string {
  const suffix = {
    shapeStroke: 'ShapeStroke',
    shapeFill: 'ShapeFill',
    textColor: 'TextColor',
    textBackground: 'TextBackground',
    sceneBackground: 'SceneBackground',
  }[key];
  return translate(`settings.editor.palette${suffix}` as Parameters<typeof translate>[0]);
}
