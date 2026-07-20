import type {
  EditorPaletteSettings,
  EditorPresetFamily,
} from '../../../features/editor/document/presets';
import { translate } from '../../../platform/i18n';
import { getSettingsCountLabel } from '../../section-surface/text.helpers';

export type EditorSettingsPresetOwner = EditorPresetFamily | 'rectangle';
export type EditorSettingsPaletteKey = keyof EditorPaletteSettings;

export const EDITOR_SETTINGS_PRESET_OWNERS: EditorSettingsPresetOwner[] = [
  'pencil',
  'highlighter',
  'rectangle',
  'ellipse',
  'arrow',
  'text',
  'step',
  'sceneBackground',
];

export const EDITOR_SETTINGS_PALETTE_KEYS: EditorSettingsPaletteKey[] = [
  'shapeStroke',
  'shapeFill',
  'textColor',
  'textBackground',
  'sceneBackground',
];

export function getEditorPresetOwnerLabel(owner: EditorSettingsPresetOwner): string {
  if (owner === 'sceneBackground') {
    return translate('editor.scene.sceneBackgroundTitle');
  }

  if (owner === 'rectangle') {
    return translate('editor.tools.rectangle');
  }

  return translate(`editor.tools.${owner}`);
}

export function getEditorPaletteLabel(key: EditorSettingsPaletteKey): string {
  switch (key) {
    case 'shapeStroke':
      return translate('settings.editor.paletteShapeStroke');
    case 'shapeFill':
      return translate('settings.editor.paletteShapeFill');
    case 'textColor':
      return translate('settings.editor.paletteTextColor');
    case 'textBackground':
      return translate('settings.editor.paletteTextBackground');
    case 'sceneBackground':
      return translate('settings.editor.paletteSceneBackground');
  }
}

export function getEditorPresetCountLabel(count: number): string {
  return getSettingsCountLabel(count, {
    one: 'settings.editor.presetCountOne',
    few: 'settings.editor.presetCountFew',
    many: 'settings.editor.presetCountMany',
  });
}

export function getEditorColorCountLabel(count: number): string {
  return getSettingsCountLabel(count, {
    one: 'settings.editor.colorCountOne',
    few: 'settings.editor.colorCountFew',
    many: 'settings.editor.colorCountMany',
  });
}
