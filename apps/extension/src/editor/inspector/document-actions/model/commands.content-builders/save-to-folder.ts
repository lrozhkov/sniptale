import type { Translate } from '../../../../../platform/i18n';
import type { EditorDocumentActionContentBuilders } from '../commands.types';
import type { BuildEditorDocumentActionGroupsParams } from '../types';

export function buildSaveToFolderContent(
  params: BuildEditorDocumentActionGroupsParams,
  translate: Translate
): EditorDocumentActionContentBuilders['saveToFolder'] {
  return {
    id: 'save-to-folder',
    kind: 'content',
    label: translate('editor.documentActions.saveToFolder'),
    content: params.renderSavePresetOptions(),
    note: translate('editor.compact.saveToFolderNote'),
  };
}
