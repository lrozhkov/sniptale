import { translate } from '../../../../../platform/i18n';
import type { EditorDocumentActionCommands } from '../commands.types';
import type { EditorDocumentActionGroup } from '../types';

export function buildScenarioDocumentActionGroupList(
  commands: EditorDocumentActionCommands
): EditorDocumentActionGroup[] {
  return [
    {
      id: 'primary-save',
      items: [
        {
          ...commands.saveImage,
          label: translate('editor.documentActions.applyToScenario'),
        },
      ],
      layout: 'stack',
    },
    {
      id: 'save-utilities',
      items: [commands.copyPng],
      layout: 'stack',
    },
    {
      id: 'image-format',
      items: [commands.imageFormat],
      layout: 'stack',
    },
    {
      id: 'close',
      items: [
        {
          ...commands.closeFile,
          label: translate('editor.documentActions.returnToScenario'),
        },
      ],
      layout: 'stack',
    },
  ];
}
