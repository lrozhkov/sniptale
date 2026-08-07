import type { EditorPresetFamily } from '../../../../../features/editor/document/presets';
import { translate } from '../../../../../platform/i18n';

export const TOOL_PRESET_OWNERS: readonly EditorPresetFamily[] = [
  'pencil',
  'highlighter',
  'ellipse',
  'arrow',
  'text',
  'step',
  'sceneBackground',
];

export function getToolPresetOwnerLabel(owner: EditorPresetFamily): string {
  return owner === 'sceneBackground'
    ? translate('editor.scene.sceneBackgroundTitle')
    : translate(`editor.tools.${owner}` as Parameters<typeof translate>[0]);
}
